from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework import status
from rest_framework.test import APIClient

from apps.dashboard.admin_trends import build_admin_trends
from apps.leave_management.models import LeaveRequest
from apps.overtime.models import Client, OvertimeLog
from apps.standby.models import StandbyLog
from apps.users.models import Team
from apps.users.models.core import TeamMembership

URL = "/api/dashboard/widgets/admin_trends/"
TODAY = date(2026, 10, 8)  # a Thursday


class TrendsBase(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.admin = User.objects.create_user("admin", password="x", is_staff=True)
        self.emp = User.objects.create_user("emp", password="x", first_name="Ema", last_name="Poli")
        self.acme = Client.objects.create(name="Acme", code="ACM")

    def get(self, user=None):
        self.api.force_authenticate(user or self.admin)
        return self.api.get(URL)

    def build(self):
        return build_admin_trends(self.admin, today=TODAY)

    def ot(self, hours, when=TODAY, status_="approved", client=None, user=None):
        return OvertimeLog.objects.create(
            user=user or self.emp, client=client or self.acme, date=when, hours=Decimal(str(hours)), status=status_
        )


class PermissionTests(TrendsBase):
    def test_employee_forbidden(self):
        self.assertEqual(self.get(self.emp).status_code, status.HTTP_403_FORBIDDEN)

    def test_hr_without_staff_forbidden(self):
        hr = User.objects.create_user("hr", password="x")
        hr.profile.is_hr_user = True
        hr.profile.save(update_fields=["is_hr_user"])
        self.assertEqual(self.get(hr).status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_ok(self):
        res = self.get()
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        for key in ("months", "hours", "leave_days", "overtime_by_client", "team_comparison", "who_is_out"):
            self.assertIn(key, res.data)


class SeriesTests(TrendsBase):
    def test_empty_org_returns_twelve_zero_months_current_last(self):
        data = self.build()
        self.assertEqual(data["months"][0], "2025-11")
        self.assertEqual(data["months"][-1], "2026-10")
        self.assertEqual(len(data["months"]), 12)
        for series in (*data["hours"].values(), *data["leave_days"].values()):
            self.assertEqual(series, [0.0] * 12)
        self.assertEqual(data["overtime_by_client"], [])
        # Migrations seed a team or two; with no activity every row must be zero/None.
        for row in data["team_comparison"]:
            self.assertEqual(row["overtime_hours"], 0.0)
            self.assertEqual(row["leave_days"], 0.0)
            self.assertIsNone(row["overtime_per_capita"])
        self.assertEqual(data["who_is_out"]["on_leave"], [])

    def test_only_approved_hours_counted_pending_is_overlay(self):
        sep = date(2026, 9, 10)
        self.ot(3, sep)
        self.ot(2, sep, status_="pending")
        self.ot(5, sep, status_="rejected")
        StandbyLog.objects.create(user=self.emp, date=sep, hours=Decimal("8"), status="approved")
        StandbyLog.objects.create(user=self.emp, date=sep, hours=Decimal("9"), status="pending")
        h = self.build()["hours"]
        self.assertEqual(h["overtime"][-2], 3.0)
        self.assertEqual(h["pending_overtime"][-2], 2.0)
        self.assertEqual(h["standby"][-2], 8.0)

    def test_leave_business_days_split_across_months(self):
        # Thu 2026-09-24 .. Tue 2026-10-06: Sep = 24,25,28,29,30 ; Oct = 1,2,5,6
        LeaveRequest.objects.create(
            user=self.emp, request_type="vacation", start_date=date(2026, 9, 24),
            end_date=date(2026, 10, 6), status="approved",
        )
        LeaveRequest.objects.create(
            user=self.emp, request_type="sick", start_date=date(2026, 9, 21),
            end_date=date(2026, 9, 21), status="approved",
        )
        LeaveRequest.objects.create(
            user=self.emp, request_type="vacation", start_date=date(2026, 9, 28),
            end_date=date(2026, 9, 28), status="pending",
        )
        v = self.build()["leave_days"]
        self.assertEqual(v["vacation"][-2], 5.0)
        self.assertEqual(v["vacation"][-1], 4.0)
        self.assertEqual(v["sick"][-2], 1.0)
        self.assertEqual(v["sick"][-1], 0.0)

    def test_data_older_than_twelve_months_is_ignored(self):
        self.ot(7, date(2025, 10, 31))
        self.assertEqual(sum(self.build()["hours"]["overtime"]), 0.0)


class ClientAndTeamTests(TrendsBase):
    def test_client_share_sums_to_100_and_remainder_grouped_as_other(self):
        for i in range(8):
            c = Client.objects.create(name=f"C{i}", code=f"C{i}")
            self.ot(10 - i, TODAY, client=c)
        rows = self.build()["overtime_by_client"]
        self.assertEqual(len(rows), 7)
        self.assertEqual(rows[-1]["name"], "Other")
        self.assertIsNone(rows[-1]["client_id"])
        self.assertEqual([r["hours"] for r in rows[:-1]], sorted((r["hours"] for r in rows[:-1]), reverse=True))
        self.assertAlmostEqual(sum(r["share_pct"] for r in rows), 100.0, delta=0.2)

    def test_only_current_month_counts_for_clients(self):
        self.ot(4, date(2026, 9, 10))
        self.assertEqual(self.build()["overtime_by_client"], [])

    def test_team_comparison_per_capita_null_for_empty_team(self):
        full = Team.objects.create(name="Full", code="FULL")
        Team.objects.create(name="Empty", code="EMPT")
        TeamMembership.objects.create(user_profile=self.emp.profile, team=full)
        other = User.objects.create_user("o2", password="x")
        TeamMembership.objects.create(user_profile=other.profile, team=full)
        self.ot(10, TODAY)
        rows = {r["name"]: r for r in self.build()["team_comparison"]}
        self.assertEqual(rows["Full"]["team_size"], 2)
        self.assertEqual(rows["Full"]["overtime_hours"], 10.0)
        self.assertEqual(rows["Full"]["overtime_per_capita"], 5.0)
        self.assertEqual(rows["Empty"]["team_size"], 0)
        self.assertIsNone(rows["Empty"]["overtime_per_capita"])

    def test_inactive_users_do_not_count_toward_team_size(self):
        team = Team.objects.create(name="T", code="T")
        gone = User.objects.create_user("gone", password="x", is_active=False)
        TeamMembership.objects.create(user_profile=gone.profile, team=team)
        rows = {r["name"]: r for r in self.build()["team_comparison"]}
        self.assertEqual(rows["T"]["team_size"], 0)


class WhoIsOutTests(TrendsBase):
    def test_lists_only_approved_leave_and_standby_for_today(self):
        team = Team.objects.create(name="Core", code="CORE")
        TeamMembership.objects.create(user_profile=self.emp.profile, team=team)
        LeaveRequest.objects.create(
            user=self.emp, request_type="vacation", start_date=TODAY - timedelta(days=1),
            end_date=TODAY + timedelta(days=2), status="approved",
        )
        pend = User.objects.create_user("pend", password="x")
        LeaveRequest.objects.create(
            user=pend, request_type="sick", start_date=TODAY, end_date=TODAY, status="pending"
        )
        StandbyLog.objects.create(user=self.emp, date=TODAY, hours=Decimal("8"), status="approved")
        StandbyLog.objects.create(user=pend, date=TODAY, hours=Decimal("8"), status="pending")
        out = self.build()["who_is_out"]
        self.assertEqual(out["date"], "2026-10-08")
        self.assertEqual([r["user_id"] for r in out["on_leave"]], [self.emp.pk])
        self.assertEqual(out["on_leave"][0]["until"], "2026-10-10")
        self.assertEqual(out["on_leave"][0]["team"], "Core")
        self.assertEqual(out["on_leave"][0]["name"], "Ema Poli")
        self.assertEqual([r["user_id"] for r in out["on_standby"]], [self.emp.pk])

    def test_caps_each_list_at_twenty(self):
        for i in range(25):
            u = User.objects.create_user(f"u{i}", password="x")
            LeaveRequest.objects.create(
                user=u, request_type="vacation", start_date=TODAY, end_date=TODAY, status="approved"
            )
        self.assertEqual(len(self.build()["who_is_out"]["on_leave"]), 20)

    def test_upcoming_leave_counts_approved_starting_tomorrow_to_day_14_only(self):
        def leave(start, st="approved"):
            u = User.objects.create_user(f"x{start}{st}", password="x")
            LeaveRequest.objects.create(user=u, request_type="vacation", start_date=start, end_date=start, status=st)

        leave(TODAY)  # starts today: not upcoming
        leave(TODAY + timedelta(days=1))
        leave(TODAY + timedelta(days=14))
        leave(TODAY + timedelta(days=15))
        leave(TODAY + timedelta(days=4), st="pending")
        self.assertEqual(self.build()["who_is_out"]["upcoming_leave_14d"], 2)


class QueryCountTests(TrendsBase):
    def _count(self):
        with CaptureQueriesContext(connection) as ctx:
            self.build()
        return len(ctx)

    def _seed(self, n):
        team = Team.objects.create(name=f"T{n}", code=f"T{n}")
        for i in range(n):
            u = User.objects.create_user(f"q{n}_{i}", password="x")
            TeamMembership.objects.create(user_profile=u.profile, team=team)
            self.ot(1, TODAY, user=u)
            StandbyLog.objects.create(user=u, date=TODAY, hours=Decimal("1"), status="approved")
            LeaveRequest.objects.create(
                user=u, request_type="vacation", start_date=TODAY, end_date=TODAY, status="approved"
            )

    def test_query_count_independent_of_row_count(self):
        self._seed(3)
        small = self._count()
        self._seed(30)
        self.assertEqual(self._count(), small)


class MonthsParamTests(TrendsBase):
    def get_months(self, value, user=None):
        self.api.force_authenticate(user or self.admin)
        return self.api.get(URL, {"months": value})

    def test_default_is_twelve(self):
        self.assertEqual(len(self.get().data["months"]), 12)

    def test_requested_period_sets_every_series_length(self):
        for n in (3, 6, 24):
            data = build_admin_trends(self.admin, today=TODAY, months=n)
            self.assertEqual(len(data["months"]), n)
            self.assertEqual(data["months"][-1], "2026-10")
            for series in (*data["hours"].values(), *data["leave_days"].values()):
                self.assertEqual(len(series), n)

    def test_six_months_starts_in_may(self):
        data = build_admin_trends(self.admin, today=TODAY, months=6)
        self.assertEqual(data["months"][0], "2026-05")

    def test_view_accepts_a_valid_period(self):
        res = self.get_months("6")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["months"]), 6)

    def test_invalid_period_is_a_400_not_a_500(self):
        for bad in ("2", "25", "0", "-1", "abc", "3.5", ""):
            res = self.get_months(bad)
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, bad)
            self.assertIn("months", res.data)

    def test_period_does_not_change_current_month_blocks(self):
        self.ot(4, TODAY)
        a = build_admin_trends(self.admin, today=TODAY, months=3)
        b = build_admin_trends(self.admin, today=TODAY, months=24)
        for key in ("overtime_by_client", "team_comparison", "who_is_out"):
            self.assertEqual(a[key], b[key], key)

    def test_older_data_appears_only_when_the_window_reaches_it(self):
        self.ot(7, date(2026, 3, 10))
        self.assertEqual(sum(build_admin_trends(self.admin, today=TODAY, months=6)["hours"]["overtime"]), 0.0)
        self.assertEqual(sum(build_admin_trends(self.admin, today=TODAY, months=12)["hours"]["overtime"]), 7.0)

    def test_still_staff_only_with_a_period(self):
        self.assertEqual(self.get_months("6", user=self.emp).status_code, status.HTTP_403_FORBIDDEN)

    def test_query_count_independent_of_period(self):
        def count(n):
            with CaptureQueriesContext(connection) as ctx:
                build_admin_trends(self.admin, today=TODAY, months=n)
            return len(ctx)

        self.assertEqual(count(3), count(24))
