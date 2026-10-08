from datetime import date, datetime, timedelta, timezone as dt_tz
from decimal import Decimal

from django.contrib.auth.models import User
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework import status
from rest_framework.test import APIClient

from apps.dashboard.admin_people import build_admin_people
from apps.leave_management.models import LeaveRequest
from apps.overtime.models import Client, OvertimeLog
from apps.standby.models import StandbyLog
from apps.users.models import Tech, TechLevel
from apps.users.models.core import UserTech

URL = "/api/dashboard/widgets/admin_people/"
TODAY = date(2026, 10, 8)
NOW = datetime(2026, 10, 8, 12, 0, tzinfo=dt_tz.utc)


class PeopleBase(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.admin = User.objects.create_user("admin", password="x", is_staff=True)
        self.emp = User.objects.create_user("emp", password="x")
        self.acme = Client.objects.create(name="Acme", code="ACM")

    def get(self, user=None):
        self.api.force_authenticate(user or self.admin)
        return self.api.get(URL)

    def build(self):
        return build_admin_people(self.admin, today=TODAY, now=NOW)

    def decide(self, approver, status_="approved", hours_to_decide=2, days_ago=1, reason="", kind="ot"):
        """A decided request; submitted_at/approved_at set explicitly."""
        approved_at = NOW - timedelta(days=days_ago)
        submitted_at = approved_at - timedelta(hours=hours_to_decide)
        if kind == "ot":
            obj = OvertimeLog.objects.create(
                user=self.emp, client=self.acme, date=TODAY, hours=Decimal("1"), status=status_
            )
            model = OvertimeLog
        elif kind == "sb":
            obj = StandbyLog.objects.create(user=self.emp, date=TODAY, hours=Decimal("1"), status=status_)
            model = StandbyLog
        else:
            obj = LeaveRequest.objects.create(
                user=self.emp, request_type="vacation", start_date=date(2026, 10, 12),
                end_date=date(2026, 10, 12), status=status_,
            )
            model = LeaveRequest
        model.objects.filter(pk=obj.pk).update(
            approved_by=approver, approved_at=approved_at, submitted_at=submitted_at, rejection_reason=reason
        )
        return obj


class PermissionTests(PeopleBase):
    def test_employee_forbidden(self):
        self.assertEqual(self.get(self.emp).status_code, status.HTTP_403_FORBIDDEN)

    def test_hr_only_forbidden(self):
        hr = User.objects.create_user("hr", password="x")
        hr.profile.is_hr_user = True
        hr.profile.save(update_fields=["is_hr_user"])
        self.assertEqual(self.get(hr).status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_ok_with_expected_keys(self):
        res = self.get()
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        for key in ("roles", "techs", "approver_sla", "rejections"):
            self.assertIn(key, res.data)

    def test_empty_org_is_zeroed(self):
        data = self.build()
        self.assertEqual(data["approver_sla"], [])
        self.assertEqual(data["rejections"]["top_reasons"], [])
        self.assertEqual(data["rejections"]["by_type"], {"overtime": 0, "standby": 0, "leave": 0})
        self.assertEqual(data["rejections"]["month"], "2026-10")


class RoleTests(PeopleBase):
    def test_roles_match_overview_definition(self):
        from apps.dashboard.admin_overview import coverage_gaps

        tl = User.objects.create_user("tl", password="x")
        tl.profile.is_italian_tl_role = True
        tl.profile.save(update_fields=["is_italian_tl_role"])
        self.assertEqual(
            self.build()["roles"]["employees_without_tl"], coverage_gaps(TODAY)["employees_without_tl"]
        )

    def test_user_with_two_roles_counted_in_each(self):
        u = User.objects.create_user("multi", password="x")
        u.profile.is_italian_tl_role = True
        u.profile.is_hr_user = True
        u.profile.role_codes = ["hbpr"]
        u.profile.save(update_fields=["is_italian_tl_role", "is_hr_user", "role_codes"])
        r = self.build()["roles"]
        self.assertEqual((r["italian_tl"], r["hr"], r["hbpr"]), (1, 1, 1))
        self.assertEqual(r["albanian_tl"], 0)
        self.assertEqual(r["staff"], 1)  # admin

    def test_inactive_users_are_not_counted(self):
        u = User.objects.create_user("gone", password="x", is_active=False)
        u.profile.is_hr_user = True
        u.profile.save(update_fields=["is_hr_user"])
        self.assertEqual(self.build()["roles"]["hr"], 0)


class TechTests(PeopleBase):
    def test_ungraded_bucket_and_levels_stay_inside_their_tech(self):
        a = Tech.objects.create(name="Alpha", code="ALP")
        b = Tech.objects.create(name="Beta", code="BET")
        a1 = TechLevel.objects.create(tech=a, name="Junior", code="A1", rank=1)
        b1 = TechLevel.objects.create(tech=b, name="Senior", code="B1", rank=1)
        u2 = User.objects.create_user("u2", password="x")
        UserTech.objects.create(user_profile=self.emp.profile, tech=a, level=a1)
        UserTech.objects.create(user_profile=u2.profile, tech=a, level=None)
        UserTech.objects.create(user_profile=u2.profile, tech=b, level=b1)
        techs = {t["name"]: t for t in self.build()["techs"]}
        self.assertEqual(techs["Alpha"]["count"], 2)
        alpha_levels = {lv["code"]: lv["count"] for lv in techs["Alpha"]["levels"]}
        self.assertEqual(alpha_levels, {"A1": 1, None: 1})
        self.assertEqual(techs["Alpha"]["levels"][-1]["name"], "Ungraded")
        self.assertEqual({lv["code"] for lv in techs["Beta"]["levels"]}, {"B1"})


class ApproverTests(PeopleBase):
    def test_avg_is_weighted_across_models(self):
        appr = User.objects.create_user("appr", password="x", first_name="Ana", last_name="Lee")
        self.decide(appr, hours_to_decide=2, kind="ot")
        for _ in range(3):
            self.decide(appr, hours_to_decide=6, kind="lv")
        row = self.build()["approver_sla"][0]
        self.assertEqual(row["user_id"], appr.pk)
        self.assertEqual(row["name"], "Ana Lee")
        self.assertEqual(row["decisions_30d"], 4)
        self.assertEqual(row["avg_decision_hours"], 5.0)  # (2 + 3*6) / 4, not mean-of-means 4.0

    def test_rate_counts_rejections_and_old_decisions_are_ignored(self):
        appr = User.objects.create_user("appr", password="x")
        self.decide(appr, "approved")
        self.decide(appr, "approved", kind="sb")
        self.decide(appr, "rejected", reason="x")
        self.decide(appr, "approved", days_ago=45)
        row = self.build()["approver_sla"][0]
        self.assertEqual(row["decisions_30d"], 3)
        self.assertAlmostEqual(row["approval_rate_pct"], 66.7, places=1)

    def test_sorted_by_decisions_and_capped_at_ten(self):
        for i in range(12):
            u = User.objects.create_user(f"a{i}", password="x")
            for _ in range(i + 1):
                self.decide(u)
        rows = self.build()["approver_sla"]
        self.assertEqual(len(rows), 10)
        self.assertEqual(rows[0]["decisions_30d"], 12)


class RejectionTests(PeopleBase):
    def test_reasons_group_case_insensitively_and_ignore_blank(self):
        appr = User.objects.create_user("appr", password="x")
        self.decide(appr, "rejected", reason="Missing ticket")
        self.decide(appr, "rejected", reason="  missing TICKET ", kind="sb")
        self.decide(appr, "rejected", reason="", kind="lv")
        self.decide(appr, "rejected", reason="Wrong client", days_ago=40)  # previous month
        rej = self.build()["rejections"]
        self.assertEqual(rej["by_type"], {"overtime": 1, "standby": 1, "leave": 1})
        self.assertEqual(rej["top_reasons"], [{"reason": "missing ticket", "count": 2}])


class QueryCountTests(PeopleBase):
    def _count(self):
        with CaptureQueriesContext(connection) as ctx:
            self.build()
        return len(ctx)

    def _seed(self, n):
        for i in range(n):
            appr = User.objects.create_user(f"q{n}_{i}", password="x")
            self.decide(appr, "rejected", reason=f"r{i}")
            self.decide(appr, "approved", kind="lv")

    def test_query_count_independent_of_row_count(self):
        self._seed(3)
        small = self._count()
        self._seed(25)
        self.assertEqual(self._count(), small)
