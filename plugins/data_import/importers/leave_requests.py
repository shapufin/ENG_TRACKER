"""
Importer for individual dated leave/vacation requests.

Distinct from ``leave_balances`` (year totals). This creates one
``LeaveRequest`` row per date range, so migrated leave shows up on the
calendar — the calendar reads ``LeaveRequest`` rows directly
(``frontend/src/lib/calendarEvents.ts``), not a separate event table.

Rows land already ``approved`` by default, matching the overtime/standby
importers' convention for historical, already-known-good data. Bulk creation
bypasses ``full_clean()``, so the two ``LeaveRequest.clean()`` invariants
(end >= start, at least one business day in range) are replicated here as
explicit row checks rather than silently skipped.
"""
from typing import Any, Dict, List, Optional

from django.contrib.auth.models import User

from apps.leave_management.models.core import LeaveRequest, count_business_days
from .authority import StaffOnlyAuthority
from .base import BaseImporter, ImportField, ImportOption, ImportRowResult, UPDATE_EXISTING_OPTION
from .registry import register


@register
class LeaveRequestImporter(StaffOnlyAuthority, BaseImporter):
    target_key = "leave_requests"
    display_name = "Leave Requests"
    description = (
        "Import individual dated leave requests (e.g. historical vacation "
        "ranges from another system). Existing users must already exist; "
        "this importer does not create users. Import leave_balances "
        "separately for correct year totals — this importer does not touch "
        "LeaveBalance."
    )
    icon = "CalendarRange"
    page_route = "/admin/leave-requests"

    def get_options(self) -> List[ImportOption]:
        return [UPDATE_EXISTING_OPTION]

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
                key="request_type", label="Type", required=False, field_type="choice",
                choices=LeaveRequest.REQUEST_TYPE_CHOICES,
                help_text="Defaults to 'vacation'.",
            ),
            ImportField(key="start_date", label="Start Date", required=True, field_type="date"),
            ImportField(key="end_date", label="End Date", required=True, field_type="date"),
            ImportField(
                key="status", label="Status", required=False, field_type="choice",
                choices=LeaveRequest.STATUS_CHOICES,
                help_text="Defaults to 'approved' — this importer is for finished, "
                           "already-known-good leave history.",
            ),
            ImportField(key="reason", label="Reason", required=False, field_type="string"),
        ]

    def get_alias_suggestions(self) -> Dict[str, List[str]]:
        return {
            "username": ["username", "user", "employee", "name"],
            "email": ["email", "email address", "e-mail"],
            "request_type": ["type", "request type", "request_type", "leave type"],
            "start_date": ["start date", "start_date", "from", "start"],
            "end_date": ["end date", "end_date", "to", "end"],
            "status": ["status"],
            "reason": ["reason", "notes", "note", "description"],
        }

    def get_dedupe_keys(self) -> List[str]:
        # No natural single-field key — (user, type, start, end) is the
        # closest logical match to "the same leave request".
        return ["username", "request_type", "start_date", "end_date"]

    def get_sample_rows(self) -> List[Dict[str, Any]]:
        return [
            {
                "username": "mrossi", "email": "m.rossi@example.com",
                "request_type": "vacation", "start_date": "2026-06-29",
                "end_date": "2026-07-03", "status": "approved", "reason": "",
            },
            {
                "username": "ahoxha", "email": "a.hoxha@example.com",
                "request_type": "vacation", "start_date": "2026-08-10",
                "end_date": "2026-08-14", "status": "approved",
                "reason": "Carried over from prior system",
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
                pass
        return None

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

        user = self._resolve_user(mapped_row)
        if not user:
            identifier = mapped_row.get("username") or mapped_row.get("email") or "?"
            return ImportRowResult(
                row_index=row_index, status="error",
                errors=[f"No existing user matches '{identifier}' (username or email)."],
            )

        start_date = mapped_row.get("start_date")
        end_date = mapped_row.get("end_date")
        if not start_date or not end_date:
            return ImportRowResult(
                row_index=row_index, status="error",
                errors=["start_date and end_date are required and must be valid dates."],
            )
        if end_date < start_date:
            return ImportRowResult(
                row_index=row_index, status="error",
                errors=["End date must not precede start date."],
            )
        if count_business_days(start_date, end_date) == 0:
            return ImportRowResult(
                row_index=row_index, status="error",
                errors=["Leave must include at least one business day."],
            )

        request_type = mapped_row.get("request_type") or "vacation"
        valid_types = {code for code, _ in LeaveRequest.REQUEST_TYPE_CHOICES}
        if request_type not in valid_types:
            return ImportRowResult(
                row_index=row_index, status="error",
                errors=[f"'{request_type}' is not a valid type. Choices: {sorted(valid_types)}."],
            )
        req_status = mapped_row.get("status") or "approved"
        valid_statuses = {code for code, _ in LeaveRequest.STATUS_CHOICES}
        if req_status not in valid_statuses:
            return ImportRowResult(
                row_index=row_index, status="error",
                errors=[f"'{req_status}' is not a valid status. Choices: {sorted(valid_statuses)}."],
            )

        existing_req = LeaveRequest.objects.filter(
            user=user, request_type=request_type, start_date=start_date, end_date=end_date,
        ).first()
        update_existing = bool(options.get("update_existing", False))
        is_update = existing_req is not None

        if is_update and not update_existing:
            return ImportRowResult(
                row_index=row_index, status="skipped",
                warnings=["A matching leave request already exists for this user/type/date range."],
            )

        if not dry_run:
            if is_update:
                existing_req.status = req_status
                if mapped_row.get("reason"):
                    existing_req.reason = mapped_row["reason"]
                existing_req.save()
            else:
                LeaveRequest.objects.create(
                    user=user,
                    request_type=request_type,
                    start_date=start_date,
                    end_date=end_date,
                    status=req_status,
                    reason=mapped_row.get("reason") or "",
                )

        return ImportRowResult(
            row_index=row_index,
            status="updated" if is_update else "created",
        )
