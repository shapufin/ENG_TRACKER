"""hr_overview feeds the HR dashboard's org-wide overtime/standby/leave widgets.

Regression coverage for the bug where the HR dashboard read the personal
self-service endpoints: pure HR got 403 (empty widgets) and multi-role HR saw
only their own logs. The endpoint must return org data to ANY HR viewer while
staying closed to plain employees, and must exclude soft-deleted rows.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.leave_management.models import LeaveRequest
from apps.overtime.models import Client, OvertimeLog
from apps.standby.models import StandbyLog

URL = "/api/dashboard/widgets/hr_overview/"


def _weekday(d):
    """First weekday on/after ``d`` — leave rows need >= 1 business day."""
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


def make_hr(username="hr"):
    user = User.objects.create_user(username, password="x")
    user.profile.is_hr_user = True
    user.profile.save(update_fields=["is_hr_user"])
    return user


class HrOverviewBase(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.hr = make_hr()
        self.staff = User.objects.create_user("staff", password="x", is_staff=True)
        self.emp = User.objects.create_user("emp", password="x")
        self.other = User.objects.create_user("other", password="x", first_name="Ot", last_name="Her")
        self.client_obj = Client.objects.create(name="Acme", code="ACM")

    def get(self, user=None):
        self.api.force_authenticate(user or self.hr)
        return self.api.get(URL)


class PermissionTests(HrOverviewBase):
    def test_employee_forbidden(self):
        self.assertEqual(self.get(self.emp).status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_forbidden(self):
        self.assertEqual(self.api.get(URL).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_pure_hr_allowed(self):
        """Pure HR is the case that previously saw an empty dashboard."""
        res = self.get(self.hr)
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

    def test_staff_allowed(self):
        self.assertEqual(self.get(self.staff).status_code, status.HTTP_200_OK)


class DataTests(HrOverviewBase):
    """Org data must reach the viewer even when they own no records."""

    def setUp(self):
        super().setUp()
        today = date.today()
        self.ot = OvertimeLog.objects.create(
            user=self.other, client=self.client_obj, date=today, hours=Decimal("2.5"),
            status="approved", submitted_at=timezone.now(),
        )
        self.sb = StandbyLog.objects.create(
            user=self.other, date=today, hours=Decimal("4"),
            status="approved", submitted_at=timezone.now(),
        )
        self.sb_pending = StandbyLog.objects.create(
            user=self.other, date=today, hours=Decimal("8"),
            status="pending", submitted_at=timezone.now(),
        )
        self.leave = LeaveRequest.objects.create(
            user=self.other, request_type="vacation", status="pending",
            start_date=_weekday(today + timedelta(days=7)),
            end_date=_weekday(today + timedelta(days=8)),
            submitted_at=timezone.now(),
        )

    def test_status_counts_are_org_wide(self):
        res = self.get(self.hr)
        c = res.data["status_counts"]
        self.assertEqual(c["pending"], 2)   # sb_pending + leave
        self.assertEqual(c["approved"], 2)  # ot + sb
        self.assertEqual(c["rejected"], 0)

    def test_recent_rows_name_the_record_owner(self):
        res = self.get(self.hr)
        self.assertEqual(res.data["recent_overtime"][0]["user_name"], "Ot Her")
        self.assertEqual(res.data["recent_overtime"][0]["hours"], 2.5)
        sb_by_id = {r["id"]: r for r in res.data["recent_standby"]}
        self.assertEqual(sb_by_id[self.sb.id]["status"], "approved")
        self.assertEqual(sb_by_id[self.sb_pending.id]["status"], "pending")

    def test_monthly_series_counts_approved_only(self):
        """Pending hours never inflate the approved-hours trend."""
        res = self.get(self.hr)
        series = res.data["monthly_hours"]
        self.assertEqual(series[-1]["standby"], 4.0)

    def test_monthly_series_is_sorted_and_sums_hours(self):
        res = self.get(self.hr)
        series = res.data["monthly_hours"]
        self.assertEqual(len(series), 6)
        months = [row["month"] for row in series]
        self.assertEqual(months, sorted(months))
        self.assertEqual(series[-1]["overtime"], 2.5)
        self.assertEqual(series[-1]["standby"], 4.0)

    def test_month_average_divides_this_months_approved_hours_by_active_users(self):
        res = self.get(self.hr)
        active = res.data["stats"]["active_users"]
        self.assertEqual(res.data["month_avg_overtime_hours"], 2.5 / active)

    def test_pending_leave_only_pending(self):
        LeaveRequest.objects.create(
            user=self.other, request_type="vacation", status="approved",
            start_date=_weekday(date.today() + timedelta(days=20)),
            end_date=_weekday(date.today() + timedelta(days=21)),
        )
        res = self.get(self.hr)
        self.assertTrue(all(r["status"] == "pending" for r in res.data["pending_leave"]))
        self.assertEqual(res.data["pending_leave_total"], 1)
        self.assertEqual(res.data["pending_leave"][0]["user_name"], "Ot Her")

    def test_soft_deleted_rows_excluded(self):
        self.ot.soft_delete()
        self.sb.soft_delete()
        self.sb_pending.soft_delete()
        self.leave.soft_delete()
        res = self.get(self.hr)
        c = res.data["status_counts"]
        self.assertEqual((c["pending"], c["approved"], c["rejected"]), (0, 0, 0))
        self.assertEqual(res.data["recent_overtime"], [])
        self.assertEqual(res.data["pending_leave_total"], 0)

    def test_stats_block_matches_global_stats_shape(self):
        res = self.get(self.hr)
        for key in ("total_users", "pending_overtime", "pending_standby",
                    "pending_leaves", "avg_overtime_hours", "active_teams_count"):
            self.assertIn(key, res.data["stats"])

    def test_query_count_does_not_grow_with_more_rows_or_owners(self):
        """A per-row query (an N+1 on the owner, holidays or day counts) would fail this."""
        self.get(self.hr)  # warm caches that are not about row count

        def count():
            with CaptureQueriesContext(connection) as ctx:
                self.assertEqual(self.get(self.hr).status_code, status.HTTP_200_OK)
            return len(ctx.captured_queries)

        before = count()
        today = date.today()
        for i in range(8):
            owner = User.objects.create_user(f"owner{i}", password="x", first_name=f"O{i}")
            OvertimeLog.objects.create(
                user=owner, client=self.client_obj, date=today, hours=Decimal("1"),
                status="approved", submitted_at=timezone.now(),
            )
            StandbyLog.objects.create(
                user=owner, date=today, hours=Decimal("2"), status="pending",
                submitted_at=timezone.now(),
            )
            LeaveRequest.objects.create(
                user=owner, request_type="vacation", status="pending",
                start_date=_weekday(today + timedelta(days=10 + i)),
                end_date=_weekday(today + timedelta(days=11 + i)),
                submitted_at=timezone.now(),
            )
        self.assertEqual(count(), before)
