"""Optional draft-payroll-run generation triggered from an OT/standby import.

The data_import plugin must never statically import another plugin's code
(see ``.devin/context/PLUGINS/06-data-import.md``), so every Payroll import
here is guarded with ``try/except ImportError`` — the same pattern used by
core's ``apps/overtime/viewsets.py`` payroll guard. When the Payroll plugin
is not installed this degrades to a no-op, never an error.
"""

import logging
from datetime import date, datetime
from typing import Any, Dict, List, Tuple

from django.contrib.auth.models import User
from django.db import transaction

from .base import ImportOption

logger = logging.getLogger(__name__)

GENERATE_DRAFT_PAYROLL_OPTION_KEY = "generate_draft_payroll"

GENERATE_DRAFT_PAYROLL_OPTION = ImportOption(
    key=GENERATE_DRAFT_PAYROLL_OPTION_KEY,
    label="Also generate a draft payroll run for affected months",
    option_type="bool",
    default=False,
    help_text=(
        "Creates a draft PayrollRun per imported month (skipped if one already "
        "exists) and includes every imported user who has a wage assignment "
        "covering that month. Users without one are skipped, not failed — "
        "review and finalize the draft run in Payroll like any other run."
    ),
)


def payroll_plugin_available() -> bool:
    try:
        import plugins.payroll.models  # noqa: F401
    except ImportError:
        return False
    return True


def parse_time_string(value: Any, field_name: str):
    """Parse an "HH:MM" / "HH:MM:SS" cell into a ``datetime.time``, or ``None``.

    Shared by overtime_logs.py and standby_logs.py: their `start_time`/
    `end_time` fields are `field_type="string"` (no upstream coercion, unlike
    `date`/`decimal`), and both models' `save()` calls `datetime.combine`
    directly on whatever is assigned — a raw string would crash there instead
    of producing a clean row error.
    """
    if not value:
        return None
    for fmt in ("%H:%M:%S", "%H:%M"):
        try:
            return datetime.strptime(str(value).strip(), fmt).time()
        except ValueError:
            continue
    raise ValueError(f"{field_name} must be a time in HH:MM format.")


def track_period(context: Dict[str, Any], work_date, user: "User") -> None:
    """Record that ``user`` has a log for ``work_date``'s month, for the
    optional draft-payroll-generation pass in `finalize_batch`."""
    periods_users = context.setdefault("payroll_periods_users", {})
    key = (work_date.year, work_date.month)
    periods_users.setdefault(key, set()).add(user)


def is_referenced_by_finalized_payroll(source_kind: str, source_id: int) -> bool:
    """True if a finalized PayrollRunEntry already snapshotted this source row.

    Mirrors ``apps/overtime/viewsets.py``'s ``_ensure_not_in_finalized_payroll``
    guard, which the importers' update path bypasses (it writes through the
    ORM directly, not through that viewset).
    """
    try:
        from plugins.payroll.models import PayrollRunEntry
    except ImportError:
        return False
    return PayrollRunEntry.objects.filter(
        source_kind=source_kind, source_id=source_id, status="finalized",
    ).exists()


def generate_draft_runs_for_periods(
    periods_users: Dict[Tuple[int, int], set], actor, *, dry_run: bool = False
) -> Dict[str, Any]:
    """Create one draft ``PayrollRun`` per ``(year, month)`` touched by the import.

    A user missing a wage assignment for that month is skipped (not fatal) —
    ``WageAssignment.resolve_for_month`` raises for a missing/ambiguous wage,
    so it is called defensively per user before handing the eligible subset
    to ``generate_draft_run``, which has no such guard and would abort the
    whole period on the first raise.

    ``dry_run`` still runs every read-only check (existing run, rule set,
    per-user wage eligibility) so ``preview`` can report the same
    runs_created/runs_skipped/users_without_wage shape as ``commit`` — it
    just skips the ``PayrollRun``/``PayrollLine`` writes themselves.
    """
    try:
        from django.core.exceptions import ValidationError as DjangoValidationError
        from plugins.payroll.models import (
            PayrollConfiguration,
            PayrollRuleSet,
            PayrollRun,
            WageAssignment,
        )
        from plugins.payroll.services.payroll_service import generate_draft_run
    except ImportError:
        return {
            "attempted": False,
            "reason": "Payroll plugin is not installed.",
            "runs_created": [],
            "runs_skipped": [],
            "users_without_wage": [],
        }

    runs_created: List[Dict[str, Any]] = []
    runs_skipped: List[Dict[str, Any]] = []
    users_without_wage: List[Dict[str, Any]] = []

    for (year, month), users in sorted(periods_users.items()):
        period_label = f"{year}-{month:02d}"
        try:
            existing = PayrollRun.objects.filter(
                year=year, month=month, status__in=["draft", "finalized"],
            ).first()
            if existing:
                runs_skipped.append({
                    "period": period_label,
                    "reason": f"A {existing.status} payroll run already exists for {period_label}.",
                })
                continue

            config = PayrollConfiguration.get_singleton()
            rule_set = PayrollRuleSet.resolve_for_date(date(year, month, 1), config.default_tax_profile)
            if not rule_set:
                runs_skipped.append({
                    "period": period_label,
                    "reason": f"No active payroll rule set is effective on {period_label}.",
                })
                continue

            eligible = []
            for user in sorted(users, key=lambda u: u.username):
                try:
                    WageAssignment.resolve_for_month(user, year, month)
                except DjangoValidationError as exc:
                    reason = exc.messages[0] if getattr(exc, "messages", None) else str(exc)
                    users_without_wage.append({
                        "period": period_label, "username": user.username, "reason": reason,
                    })
                    continue
                eligible.append(user)

            if not eligible:
                runs_skipped.append({
                    "period": period_label,
                    "reason": f"No user imported for {period_label} has a wage assignment.",
                })
                continue

            if dry_run:
                runs_created.append({
                    "period": period_label, "run_id": None, "user_count": len(eligible),
                })
                continue

            # Isolated in its own savepoint: a failure here must not roll back
            # the OT/standby rows this import already committed.
            with transaction.atomic():
                run = PayrollRun.objects.create(
                    year=year, month=month, status="draft", rule_set=rule_set,
                    notes="Auto-generated from a data import batch.", created_by=actor,
                )
                generate_draft_run(run, eligible)

            runs_created.append({
                "period": period_label, "run_id": run.id, "user_count": len(eligible),
            })
        except Exception as exc:  # noqa: BLE001
            # Never propagate: this is a best-effort extra, not the import
            # itself — a bug here must surface as a skip, not an import failure.
            logger.error("Draft payroll generation failed for %s: %s", period_label, exc, exc_info=True)
            runs_skipped.append({
                "period": period_label,
                "reason": f"Draft payroll generation failed for {period_label}: {exc}",
            })

    return {
        "attempted": True,
        "runs_created": runs_created,
        "runs_skipped": runs_skipped,
        "users_without_wage": users_without_wage,
    }
