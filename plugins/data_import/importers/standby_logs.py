"""
Importer for historical StandbyLog entries.

See overtime_logs.py for the shared reasoning (monthly lock only gates
update/destroy, never create; auto-approved on import; optional draft
payroll generation). StandbyLog differs in having an M2M `clients` field
instead of a single FK, so there is no client-based dedupe key.
"""

from decimal import Decimal
from typing import Any, Dict, List, Optional

from django.contrib.auth.models import User
from django.utils import timezone

from core.utils.time_overlap import find_overlapping_entry

from apps.overtime.models import Client
from apps.standby.models import StandbyLog
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
from .overtime_logs import client_choices
from .registry import register


@register
class StandbyLogImporter(StaffOnlyAuthority, BaseImporter):
    target_key = "standby_logs"
    display_name = "Standby Logs"
    description = (
        "Import historical standby entries. Rows are created already "
        "approved (this importer is for finished, already-known-good months)."
    )
    icon = "PhoneCall"
    page_route = "/admin/standby"

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
            ImportField(key="date", label="Date", required=True, field_type="date"),
            ImportField(
                key="hours", label="Hours", required=False, field_type="decimal",
                help_text="Required unless both Start Time and End Time are given "
                           "(hours are then computed from the time range).",
            ),
            ImportField(key="start_time", label="Start Time", required=False, field_type="string",
                        help_text="24h format, e.g. 18:00."),
            ImportField(key="end_time", label="End Time", required=False, field_type="string",
                        help_text="24h format, e.g. 09:00."),
            ImportField(
                key="client_codes", label="Client Codes", required=False, field_type="string",
                choices=client_choices(),
                help_text="Comma-separated codes of existing clients covered by this standby "
                          "entry, matched case-insensitively. Unknown codes can be remapped "
                          "in the Value Transforms panel below.",
            ),
            ImportField(key="description", label="Description", required=False, field_type="string"),
            ImportField(key="evidence", label="Evidence", required=False, field_type="string",
                        help_text="Ticket numbers, call references, etc."),
        ]

    def get_alias_suggestions(self) -> Dict[str, List[str]]:
        return {
            "username": ["username", "user", "employee"],
            "email": ["email", "email address", "e-mail"],
            "date": ["date", "work date", "day"],
            "hours": ["hours", "standby hours"],
            "start_time": ["start", "start time", "start_time"],
            "end_time": ["end", "end time", "end_time"],
            "client_codes": ["client codes", "client_codes", "clients", "client"],
            "description": ["description", "notes", "details"],
            "evidence": ["evidence", "reference", "ticket"],
        }

    def get_dedupe_keys(self) -> List[str]:
        # StandbyLog has no client FK to key on; (user, date) is the closest
        # logical match — a user can in principle log more than one standby
        # entry per day, but importing more than one is rare enough that a
        # per-user-per-day match is the practical default here.
        return ["username", "date"]

    def get_sample_rows(self) -> List[Dict[str, Any]]:
        return [
            {
                "username": "mrossi", "email": "m.rossi@example.com", "date": "2026-01-05",
                "hours": "12", "start_time": "18:00", "end_time": "06:00",
                "client_codes": "ACME", "description": "Weeknight standby", "evidence": "",
            },
            {
                "username": "ahoxha", "email": "a.hoxha@example.com", "date": "2026-01-06",
                "hours": "24", "start_time": "", "end_time": "",
                "client_codes": "ACME,GLOBEX", "description": "Weekend standby", "evidence": "",
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

    def _resolve_clients(self, mapped_row: Dict[str, Any]) -> "tuple[list, Optional[str]]":
        raw = mapped_row.get("client_codes")
        if not raw:
            return [], None
        clients = []
        missing = []
        for code in str(raw).split(","):
            code = code.strip()
            if not code:
                continue
            client = Client.objects.filter(code=code).first() or Client.objects.filter(code__iexact=code).first()
            if client is None:
                missing.append(code)
            elif client not in clients:
                clients.append(client)
        if missing:
            return [], (
                f"No client(s) with code(s): {', '.join(missing)}. Map them to existing "
                "clients in the Value Transforms panel, or import clients first."
            )
        return clients, None

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

            clients, client_error = self._resolve_clients(mapped_row)
            if client_error:
                return ImportRowResult(row_index=row_index, status="error", errors=[client_error])

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
                hours = None  # StandbyLog.save() computes hours from the time range.
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

            existing_log = StandbyLog.objects.filter(user=user, date=work_date).first()
            update_existing = bool(options.get("update_existing", False))
            is_update = existing_log is not None

            # Tracked before the skip-vs-update branch: an already-correct,
            # skipped duplicate still has approved hours for this user/period
            # and must still count toward draft-payroll eligibility.
            track_period(context, work_date, user)

            if is_update and not update_existing:
                return ImportRowResult(
                    row_index=row_index, status="skipped",
                    warnings=["A standby log already exists for this user/date."],
                )

            if is_update and is_referenced_by_finalized_payroll("standby", existing_log.pk):
                return ImportRowResult(
                    row_index=row_index, status="error",
                    errors=["This standby entry belongs to finalized payroll and cannot be changed via import."],
                )

            if start_time and end_time:
                overlap = find_overlapping_entry(
                    StandbyLog.objects.all(), user.id, work_date, start_time, end_time,
                    exclude_pk=existing_log.pk if is_update else None,
                )
                if overlap:
                    return ImportRowResult(
                        row_index=row_index, status="error",
                        errors=[f"Time range overlaps an existing standby entry on {work_date} "
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
                    if mapped_row.get("evidence"):
                        existing_log.evidence = mapped_row["evidence"]
                    existing_log.save()
                    if clients:
                        existing_log.clients.set(clients)
                else:
                    existing_log = StandbyLog(
                        user=user, date=work_date,
                        hours=hours if hours is not None else Decimal("1"),
                        start_time=start_time, end_time=end_time,
                        description=mapped_row.get("description") or "",
                        evidence=mapped_row.get("evidence") or "",
                        status="approved", approved_by=context.get("actor"),
                        approved_at=timezone.now(),
                    )
                    # One row-per-day notification per imported user would bloat
                    # the notification bar for a bulk (e.g. week-long) import —
                    # suppress the per-row signal and bundle in finalize_batch.
                    existing_log._skip_notifications = True
                    existing_log.save()
                    if clients:
                        existing_log.clients.set(clients)
                    context.setdefault("standby_created_dates", {}).setdefault(user.id, []).append(work_date)
                    context.setdefault("standby_created_users", {})[user.id] = user

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
        if not dry_run:
            self._notify_created_users(context)

        if not options.get(GENERATE_DRAFT_PAYROLL_OPTION_KEY):
            return
        periods_users = context.get("payroll_periods_users") or {}
        if not periods_users:
            return
        context["payroll_result"] = generate_draft_runs_for_periods(
            periods_users, context.get("actor"), dry_run=dry_run,
        )

    def _notify_created_users(self, context: Dict[str, Any]) -> None:
        """One bundled range notification per user instead of one per row."""
        created_dates = context.get("standby_created_dates") or {}
        created_users = context.get("standby_created_users") or {}
        if not created_dates:
            return

        from plugins.notifications.signals import _create_notification
        from plugins.notifications.types.own import StandbySubmittedNotification

        event_type = StandbySubmittedNotification.event_type
        for user_id, dates in created_dates.items():
            user = created_users.get(user_id)
            if not user:
                continue
            start, end = min(dates), max(dates)
            message = (
                f'Your standby logs for {start} to {end} have been submitted.'
                if start != end else
                f'Your standby log for {start} has been submitted.'
            )
            _create_notification(
                user=user,
                title='New Standby Logs' if start != end else 'New Standby Log',
                message=message,
                event_type=event_type,
                notification_type='info',
            )
