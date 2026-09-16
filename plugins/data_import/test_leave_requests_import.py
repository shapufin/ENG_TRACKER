"""Tests for the leave_requests importer.

Individual dated vacation entries, distinct from the leave_balances importer
(year totals). Exists so migrated leave shows up on the calendar, which reads
LeaveRequest rows directly (frontend/src/lib/calendarEvents.ts) rather than
a separate event table.
"""
import datetime

from django.contrib.auth.models import User
from django.test import TestCase

from apps.leave_management.models import LeaveRequest
from plugins.data_import.importers.leave_requests import LeaveRequestImporter


class LeaveRequestImporterTests(TestCase):
    def setUp(self):
        self.importer = LeaveRequestImporter()
        self.user = User.objects.create_user(username="mrossi", email="m.rossi@example.com", password="x")

    def _row(self, **overrides):
        # Rows arrive at commit_row() already coerced by _parse_value in the
        # real pipeline, so dates are date objects here, not strings.
        row = {
            "__row_index": 1,
            "username": "mrossi",
            "request_type": "vacation",
            "start_date": datetime.date(2026, 6, 29),
            "end_date": datetime.date(2026, 7, 3),
            "status": "approved",
            "reason": "",
        }
        row.update(overrides)
        return row

    def test_creates_an_approved_vacation_request(self):
        result = self.importer.commit_row(self._row(), {})
        self.assertEqual(result.status, "created", result.errors)
        req = LeaveRequest.objects.get(user=self.user)
        self.assertEqual(req.request_type, "vacation")
        self.assertEqual(req.status, "approved")
        self.assertEqual(str(req.start_date), "2026-06-29")
        self.assertEqual(str(req.end_date), "2026-07-03")

    def test_reason_carries_the_source_note(self):
        result = self.importer.commit_row(
            self._row(reason="Date range corrected"), {}
        )
        self.assertEqual(result.status, "created")
        req = LeaveRequest.objects.get(user=self.user)
        self.assertEqual(req.reason, "Date range corrected")

    def test_unknown_user_is_a_row_error(self):
        result = self.importer.commit_row(self._row(username="ghost"), {})
        self.assertEqual(result.status, "error")
        self.assertIn("ghost", result.errors[0])

    def test_end_before_start_is_a_row_error(self):
        result = self.importer.commit_row(
            self._row(
                start_date=datetime.date(2026, 7, 3), end_date=datetime.date(2026, 6, 29)
            ),
            {},
        )
        self.assertEqual(result.status, "error")
        self.assertIn("precede", result.errors[0])

    def test_a_weekend_only_range_is_a_row_error(self):
        """No business days in range -> LeaveRequest.clean()'s own rule,
        replicated here since bulk creation never calls full_clean()."""
        # 2026-08-01 is a Saturday, 2026-08-02 a Sunday.
        result = self.importer.commit_row(
            self._row(
                start_date=datetime.date(2026, 8, 1), end_date=datetime.date(2026, 8, 2)
            ),
            {},
        )
        self.assertEqual(result.status, "error")
        self.assertIn("business day", result.errors[0])

    def test_dedupes_on_user_type_and_date_range(self):
        self.importer.commit_row(self._row(), {})
        result = self.importer.commit_row(self._row(), {"update_existing": False})
        self.assertEqual(result.status, "skipped")
        self.assertEqual(LeaveRequest.objects.filter(user=self.user).count(), 1)

    def test_update_existing_overwrites_status_and_reason(self):
        self.importer.commit_row(self._row(status="pending"), {})
        result = self.importer.commit_row(
            self._row(status="approved", reason="reconciled"),
            {"update_existing": True},
        )
        self.assertEqual(result.status, "updated")
        req = LeaveRequest.objects.get(user=self.user)
        self.assertEqual(req.status, "approved")
        self.assertEqual(req.reason, "reconciled")

    def test_sick_leave_type_is_accepted(self):
        result = self.importer.commit_row(self._row(request_type="sick"), {})
        self.assertEqual(result.status, "created", result.errors)
        self.assertEqual(LeaveRequest.objects.get(user=self.user).request_type, "sick")

    def test_blank_request_type_defaults_to_vacation(self):
        result = self.importer.commit_row(self._row(request_type=""), {})
        self.assertEqual(result.status, "created", result.errors)
        self.assertEqual(LeaveRequest.objects.get(user=self.user).request_type, "vacation")
