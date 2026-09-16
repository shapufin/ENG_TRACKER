"""
Importer for historical OvertimeLog entries.

Only reachable for finished (past) months in practice — the monthly lock
(`MonthlyLockMixin`) gates `update`/`partial_update`/`destroy` on the
OvertimeLog viewset only, never `create`, so bulk-creating past-month rows
through the ORM here (bypassing the viewset entirely, like every other
importer) needs no special bypass.
"""

from decimal import Decimal
from typing import Any, Dict, List, Optional

from django.contrib.auth.models import User
from django.utils import timezone

from core.utils.time_overlap import find_overlapping_entry

from apps.overtime.models import Client, OvertimeLog
from .authority import StaffOnlyAuthority
from .base import BaseImporter, ImportField, ImportOption, ImportRowResult, UPDATE_EXISTING_OPTION
from .payroll_draft import (
    GENERATE_DRAFT_PAYROLL_OPTION,
    GENERATE_DRAFT_PAYROLL_OPTION_KEY,
    generate_draft_runs_for_periods,
    is_referenced_by_finalized_payroll,
    parse_time_string,
    payroll_plugin_available,
    track_period,
)
from .registry import register


def client_choices() -> "List[tuple]":
    """Choices for client reference fields: (code, "CODE — Name") for active clients."""
    return [
        (c.code, f"{c.code} — {c.name}")
        for c in Client.objects.filter(is_active=True).order_by("code")
    ]


@register
class OvertimeLogImporter(StaffOnlyAuthority, BaseImporter):
    target_key = "overtime_logs"
    display_name = "Overtime Logs"
    description = (
        "Import historical overtime entries. Rows are created already "
        "approved (this importer is for finished, already-known-good months)."
    )
    icon = "Clock"
    page_route = "/admin/overtime"

    def get_options(self) -> List[ImportOption]:
        options = [UPDATE_EXISTING_OPTION]
        if payroll_plugin_available():
            options.append(GENERATE_DRAFT_PAYROLL_OPTION)
        return options

    def get_fields(self) -> List[ImportField]:
        return [
            ImportField(
                key="username", label="Username", required=True, field_type="string",
                help_text="Username of an existing user. Used to match the user.",
            ),
            ImportField(
                key="email", label="Email", required=False, field_type="email",
                help_text="Fallback to match an existing user when username is missing.",
            ),
            ImportField(
                key="client_code", label="Client Code", required=True, field_type="string",
                choices=client_choices(),
                help_text="Code of an existing client, matched case-insensitively. "
                          "Unknown codes can be remapped to an existing client in the "
                          "Value Transforms panel below.",
            ),
            ImportField(key="date", label="Date", required=True, field_type="date"),
            ImportField(
                key="hours", label="Hours", required=False, field_type="decimal",
                help_text="Required unless both Start Time and End Time are given "
                           "(hours are then computed from the time range).",
            ),
            ImportField(key="start_time", label="Start Time", required=False, field_type="string",
                        help_text="24h format, e.g. 18:00."),
            ImportField(key="end_time", label="End Time", required=False, field_type="string",
                        help_text="24h format, e.g. 21:00."),
            ImportField(key="description", label="Description", required=False, field_type="string"),
            ImportField(
                key="evidence_type", label="Evidence Type", required=False, field_type="choice",
                choices=OvertimeLog.EVIDENCE_TYPE_CHOICES, help_text="Defaults to 'other'.",
            ),
            ImportField(key="evidence", label="Evidence", required=False, field_type="string",
                        help_text="Ticket numbers, call references, release tags."),
        ]

    def get_alias_suggestions(self) -> Dict[str, List[str]]:
        return {
            "username": ["username", "user", "employee"],
            "email": ["email", "email address", "e-mail"],
            "client_code": ["client code", "client_code", "client"],
            "date": ["date", "work date", "day"],
            "hours": ["hours", "overtime hours", "ot hours"],
            "start_time": ["start", "start time", "start_time"],
            "end_time": ["end", "end time", "end_time"],
            "description": ["description", "notes", "details"],
            "evidence_type": ["evidence type", "evidence_type"],
            "evidence": ["evidence", "reference", "ticket"],
        }

    def get_dedupe_keys(self) -> List[str]:
        # OvertimeLog has no DB uniqueness left (the overlap-check replaced
        # it); this is a logical match used only to decide skip-vs-update.
        return ["username", "date", "client_code"]

    def get_sample_rows(self) -> List[Dict[str, Any]]:
        return [
            {
                "username": "mrossi", "email": "m.rossi@example.com", "client_code": "ACME",
                "date": "2026-01-05", "hours": "3", "start_time": "18:00", "end_time": "21:00",
                "description": "Release deployment support", "evidence_type": "ticket",
                "evidence": "INC-1234",
            },
            {
                "username": "ahoxha", "email": "a.hoxha@example.com", "client_code": "GLOBEX",
                "date": "2026-01-06", "hours": "2", "start_time": "", "end_time": "",
                "description": "On-call incident", "evidence_type": "call", "evidence": "",
            },
        ]

    def _resolve_user(self, mapped_row: Dict[str, Any]) -> Optional[User]:
        username = mapped_row.get("username")
        if username:
            try:
                return User.objects.get(username=username)
            except User.DoesNotExist:
                pass
        email = mapped_row.get("email")
        if email:
            try:
                return User.objects.get(email=email)
            except (User.DoesNotExist, User.MultipleObjectsReturned):
                # Django does not enforce a unique email — an ambiguous match
                # is treated the same as no match, not a raw 500.
                pass
        return None

    def _resolve_client(self, raw_code: Any) -> Optional[Client]:
        """Match a client leniently: trimmed, then case-insensitive."""
        code = str(raw_code or "").strip()
        if not code:
            return None
        try:
            return Client.objects.get(code=code)
        except Client.DoesNotExist:
            return Client.objects.filter(code__iexact=code).first()

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
        context = context if context is not None else {}

        try:
            user = self._resolve_user(mapped_row)
            if not user:
                return ImportRowResult(
                    row_index=row_index, status="error",
                    errors=["No existing user matches the provided username or email."],
                )

            client_code = mapped_row.get("client_code")
            if not client_code or not str(client_code).strip():
                return ImportRowResult(row_index=row_index, status="error", errors=["client_code is required."])
            client = self._resolve_client(client_code)
            if client is None:
                return ImportRowResult(
                    row_index=row_index, status="error",
                    errors=[
                        f"No client with code '{client_code}'. Map it to an existing client in the "
                        "Value Transforms panel, or import clients first."
                    ],
                )

            work_date = mapped_row.get("date")
            if not work_date:
                return ImportRowResult(
                    row_index=row_index, status="error", errors=["date is required and must be a valid date."],
                )

            try:
                start_time = parse_time_string(mapped_row.get("start_time"), "start_time")
                end_time = parse_time_string(mapped_row.get("end_time"), "end_time")
            except ValueError as e:
                return ImportRowResult(row_index=row_index, status="error", errors=[str(e)])
            # "hours" is already coerced to Decimal (or None on a blank/unparsable
            # cell) upstream in _parse_value — no need to re-parse it here.
            hours = mapped_row.get("hours")

            if start_time and end_time:
                hours = None  # OvertimeLog.save() computes hours from the time range.
            elif hours is None:
                return ImportRowResult(
                    row_index=row_index, status="error",
                    errors=["hours is required and must be a valid number when start_time/end_time are not both given."],
                )
            elif hours <= 0 or hours > 24:
                return ImportRowResult(
                    row_index=row_index, status="error",
                    errors=["hours must be greater than 0 and at most 24."],
                )

            existing_log = OvertimeLog.objects.filter(user=user, date=work_date, client=client).first()
            update_existing = bool(options.get("update_existing", False))
            is_update = existing_log is not None

            # Tracked before the skip-vs-update branch: an already-correct,
            # skipped duplicate still has approved hours for this user/period
            # and must still count toward draft-payroll eligibility.
            track_period(context, work_date, user)

            if is_update and not update_existing:
                return ImportRowResult(
                    row_index=row_index, status="skipped",
                    warnings=["An overtime log already exists for this user/date/client."],
                )

            if is_update and is_referenced_by_finalized_payroll("overtime", existing_log.pk):
                return ImportRowResult(
                    row_index=row_index, status="error",
                    errors=["This overtime entry belongs to finalized payroll and cannot be changed via import."],
                )

            if start_time and end_time:
                overlap = find_overlapping_entry(
                    OvertimeLog.objects.all(), user.id, work_date, start_time, end_time,
                    exclude_pk=existing_log.pk if is_update else None,
                )
                if overlap:
                    return ImportRowResult(
                        row_index=row_index, status="error",
                        errors=[f"Time range overlaps an existing overtime entry on {work_date} "
                                f"({overlap.start_time}–{overlap.end_time})."],
                    )

            if not dry_run:
                if is_update:
                    if start_time and end_time:
                        existing_log.start_time = start_time
                        existing_log.end_time = end_time
                    if hours is not None:
                        existing_log.hours = hours
                    if mapped_row.get("description"):
                        existing_log.description = mapped_row["description"]
                    if mapped_row.get("evidence_type"):
                        existing_log.evidence_type = mapped_row["evidence_type"]
                    if mapped_row.get("evidence"):
                        existing_log.evidence = mapped_row["evidence"]
                    existing_log.save()
                else:
                    OvertimeLog.objects.create(
                        user=user, client=client, date=work_date,
                        hours=hours if hours is not None else Decimal("1"),
                        start_time=start_time, end_time=end_time,
                        description=mapped_row.get("description") or "",
                        evidence_type=mapped_row.get("evidence_type") or "other",
                        evidence=mapped_row.get("evidence") or "",
                        status="approved", approved_by=context.get("actor"),
                        approved_at=timezone.now(),
                    )

            if dry_run:
                return ImportRowResult(row_index=row_index, status="valid")
            return ImportRowResult(row_index=row_index, status="updated" if is_update else "created")

        except ValueError as e:
            return ImportRowResult(row_index=row_index, status="error", errors=[str(e)])
        except Exception as e:  # noqa: BLE001
            return ImportRowResult(row_index=row_index, status="error", errors=[f"Unexpected error: {str(e)}"])

    def finalize_batch(
        self, context: Dict[str, Any], options: Dict[str, Any], *, dry_run: bool = False
    ) -> None:
        if not options.get(GENERATE_DRAFT_PAYROLL_OPTION_KEY):
            return
        periods_users = context.get("payroll_periods_users") or {}
        if not periods_users:
            return
        context["payroll_result"] = generate_draft_runs_for_periods(
            periods_users, context.get("actor"), dry_run=dry_run,
        )
