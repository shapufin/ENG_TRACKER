"""
Importer for payroll wage assignments.

The Payroll plugin is an optional dependency of the data_import plugin, so
every ``plugins.payroll`` import here is guarded with ``try/except ImportError``
— the same pattern used by ``payroll_draft.py``. When Payroll is not installed
the target's authority check denies it, so it never appears in ``/targets/``.

Row behavior mirrors the wage Edit dialog and ``WageAssignmentSerializer``:
the matched row is the user's most recent active assignment, a blank cell
keeps the existing value, and a period that collides with another active
assignment is a row error (day-level) or a warning (same calendar month).
"""

from datetime import date
from typing import Any, Dict, List, Optional

from django.contrib.auth.models import User
from django.db.models import Q

from .authority import PayrollAuthority
from .base import BaseImporter, ImportField, ImportRowResult, UPDATE_EXISTING_OPTION
from .registry import register

#: Months listed per same-month warning before the text is truncated.
MAX_MONTH_LABELS = 6


def _wage_assignment_model():
    """Return ``WageAssignment``, or None when Payroll is not installed."""
    try:
        from plugins.payroll.models import WageAssignment
    except ImportError:
        return None
    return WageAssignment


def _intersecting_months(
    start: date, end: Optional[date], other_start: date, other_end: Optional[date]
) -> tuple[List[str], bool]:
    """Return the calendar months two periods share, month to month.

    Comparison is at month granularity on purpose: two January wages that
    never share a day still collide in ``resolve_for_month``. Returns an
    empty list when the periods share no month, and ``True`` as the second
    value when both periods are open-ended (the shared span never ends).
    """
    lo = max(start, other_start)
    lo_month = (lo.year, lo.month)

    end_months = [
        (e.year, e.month) for e in (end, other_end) if e is not None
    ]
    if not end_months:
        return [f"{lo.year}-{lo.month:02d}"], True
    hi_month = min(end_months)
    if hi_month < lo_month:
        return [], False

    total = (hi_month[0] - lo_month[0]) * 12 + (hi_month[1] - lo_month[1]) + 1
    labels: List[str] = []
    year, month = lo_month
    for _ in range(min(total, MAX_MONTH_LABELS)):
        labels.append(f"{year}-{month:02d}")
        month += 1
        if month == 13:
            year, month = year + 1, 1
    if total > MAX_MONTH_LABELS:
        labels.append("...")
    return labels, False


@register
class WageImporter(PayrollAuthority, BaseImporter):
    target_key = "wages"
    display_name = "Payroll Wages"
    description = (
        "Set gross monthly wage assignments for existing employees. "
        "Users are not created; a blank cell keeps the current value."
    )
    icon = "Banknote"
    page_route = "/admin/payroll/wages"

    def get_fields(self) -> List[ImportField]:
        return [
            ImportField(
                key="username",
                label="Username",
                required=True,
                field_type="string",
                help_text="Username of an existing user.",
            ),
            ImportField(
                key="gross_monthly_wage",
                label="Gross Monthly Wage",
                required=True,
                field_type="decimal",
                help_text="Gross monthly wage in the configured currency (Lek).",
            ),
            ImportField(
                key="effective_from",
                label="Effective From",
                required=True,
                field_type="date",
                help_text="First day the wage applies (YYYY-MM-DD).",
            ),
            ImportField(
                key="effective_to",
                label="Effective To",
                required=False,
                field_type="date",
                help_text="Leave blank for an open-ended wage. Blank keeps an existing end date.",
            ),
            ImportField(
                key="note",
                label="Note",
                required=False,
                field_type="string",
                help_text="Blank keeps the existing note when updating.",
            ),
        ]

    def get_alias_suggestions(self) -> Dict[str, List[str]]:
        # Keys and labels both appear as template headers ("Gross Monthly Wage *"),
        # so auto-detect must match either form after normalize_columns strips "*".
        return {
            "username": ["username", "user name", "login", "user", "employee"],
            "gross_monthly_wage": [
                "gross monthly wage",
                "gross_monthly_wage",
                "monthly wage",
                "wage",
                "salary",
                "gross",
            ],
            "effective_from": [
                "effective from",
                "effective_from",
                "start date",
                "valid from",
                "from",
            ],
            "effective_to": ["effective to", "effective_to", "end date", "valid to", "to"],
            "note": ["note", "notes", "comment", "comments"],
        }

    def get_dedupe_keys(self) -> List[str]:
        return ["username"]

    def get_options(self):
        return [UPDATE_EXISTING_OPTION]

    def get_sample_rows(self) -> List[Dict[str, Any]]:
        return [
            {
                "username": "mrossi",
                "gross_monthly_wage": 150000,
                "effective_from": "2026-01-01",
            },
            {
                "username": "ahoxha",
                "gross_monthly_wage": 135000,
                "effective_from": "2026-01-01",
                "note": "Contractual raise",
            },
        ]

    def _month_warnings(
        self,
        WageAssignment,
        user,
        start: date,
        end: Optional[date],
        exclude_pk: Optional[int],
    ) -> List[str]:
        """Warn when another active assignment shares a calendar month.

        Payroll resolves exactly one wage per month
        (``WageAssignment.resolve_for_month``), so two same-month wages turn
        into a hard payroll error later even when the periods never share a
        day. The day-level overlap check catches the shared-day case first.
        """
        others = WageAssignment.objects.filter(user=user, is_active=True)
        if exclude_pk is not None:
            others = others.exclude(pk=exclude_pk)

        warnings: List[str] = []
        for other in others:
            labels, infinite = _intersecting_months(
                start, end, other.effective_from, other.effective_to
            )
            if not labels:
                continue
            text = ", ".join(labels)
            span = f"{text} onward" if infinite else text
            warnings.append(
                f"Another active wage also applies in {span}; payroll resolves "
                f"exactly one wage per month and will error for those months."
            )
        return warnings

    def commit_row(
        self,
        mapped_row: Dict[str, Any],
        options: Dict[str, Any],
        *,
        existing: Optional[Any] = None,
        dry_run: bool = False,
        context: Optional[Dict[str, Any]] = None,
    ) -> ImportRowResult:
        row_index = mapped_row.get("__row_index", 0)
        actor = (context or {}).get("actor")

        WageAssignment = _wage_assignment_model()
        if WageAssignment is None:
            return ImportRowResult(
                row_index=row_index,
                status="error",
                errors=["Payroll plugin is not installed."],
            )

        try:
            username = mapped_row.get("username")
            user = User.objects.filter(username=username).first() if username else None
            if user is None:
                return ImportRowResult(
                    row_index=row_index,
                    status="error",
                    errors=["No existing user matches the provided username."],
                )

            wage = mapped_row.get("gross_monthly_wage")
            effective_from = mapped_row.get("effective_from")
            effective_to = mapped_row.get("effective_to")
            note = mapped_row.get("note")

            # A cell that held a value but could not be parsed must error, not
            # fall through to blank-keeps-the-existing-value below, which would
            # silently report "updated" while writing nothing.
            parse_errors = mapped_row.get("__parse_errors")
            if parse_errors:
                field_types = {f.key: f.field_type for f in self.get_fields()}
                errors = []
                for key in parse_errors:
                    field_type = field_types.get(key)
                    if field_type == "date":
                        errors.append(f"{key} must be a valid date.")
                    elif field_type in ("decimal", "integer"):
                        errors.append(f"{key} must be a valid number.")
                    else:
                        errors.append(f"{key} has an invalid value.")
                return ImportRowResult(row_index=row_index, status="error", errors=errors)

            def blank(value: Any) -> bool:
                return value in (None, "")

            assignment = existing
            if assignment is None:
                assignment = (
                    WageAssignment.objects.filter(user=user, is_active=True)
                    .order_by("-effective_from")
                    .first()
                )

            if assignment is not None:
                if not options.get("update_existing"):
                    return ImportRowResult(
                        row_index=row_index,
                        status="skipped",
                        warnings=["User already has an active wage assignment."],
                    )
                new_wage = assignment.gross_monthly_wage if blank(wage) else wage
                new_from = assignment.effective_from if blank(effective_from) else effective_from
                new_to = assignment.effective_to if blank(effective_to) else effective_to
                new_note = assignment.note if blank(note) else note
                exclude_pk = assignment.pk
            else:
                errors = []
                if blank(wage):
                    errors.append("gross_monthly_wage is required.")
                if blank(effective_from):
                    errors.append("effective_from is required.")
                if errors:
                    return ImportRowResult(
                        row_index=row_index, status="error", errors=errors
                    )
                new_wage, new_from, new_to, new_note = wage, effective_from, effective_to, note
                exclude_pk = None

            if new_wage < 0:
                return ImportRowResult(
                    row_index=row_index,
                    status="error",
                    errors=["Wage cannot be negative."],
                )
            if new_to and new_from and new_to < new_from:
                return ImportRowResult(
                    row_index=row_index,
                    status="error",
                    errors=["Effective to must be on or after effective from."],
                )

            overlap = WageAssignment.objects.filter(
                user=user,
                is_active=True,
                effective_from__lte=new_to or date.max,
            ).filter(Q(effective_to__isnull=True) | Q(effective_to__gte=new_from))
            if exclude_pk is not None:
                overlap = overlap.exclude(pk=exclude_pk)
            if overlap.exists():
                return ImportRowResult(
                    row_index=row_index,
                    status="error",
                    errors=["This wage period overlaps an active wage assignment."],
                )

            warnings = self._month_warnings(
                WageAssignment, user, new_from, new_to, exclude_pk
            )

            if dry_run:
                return ImportRowResult(
                    row_index=row_index, status="valid", warnings=warnings
                )

            if assignment is not None:
                assignment.gross_monthly_wage = new_wage
                assignment.effective_from = new_from
                assignment.effective_to = new_to
                assignment.note = new_note or ""
                assignment.updated_by = actor
                assignment.save()
                return ImportRowResult(
                    row_index=row_index, status="updated", warnings=warnings
                )

            WageAssignment.objects.create(
                user=user,
                gross_monthly_wage=new_wage,
                effective_from=new_from,
                effective_to=new_to,
                note=new_note or "",
                is_active=True,
                created_by=actor,
                updated_by=actor,
            )
            return ImportRowResult(
                row_index=row_index, status="created", warnings=warnings
            )

        except ValueError as e:
            return ImportRowResult(row_index=row_index, status="error", errors=[str(e)])
        except Exception as e:  # noqa: BLE001
            return ImportRowResult(
                row_index=row_index,
                status="error",
                errors=[f"Unexpected error: {str(e)}"],
            )
