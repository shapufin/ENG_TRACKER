from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.leave_management.models import LeaveBalance, LeaveRequest
from apps.overtime.models import Client, OvertimeLog
from apps.standby.models import StandbyLog
from apps.users.models import ApprovalPeriodBoundary, ApprovalPeriodClose, Team
from apps.users.models.hbpr import HbprAlbanianTlAssignment

URL = "/api/dashboard/widgets/admin_overview/"


def _age(obj, days):
    type(obj).objects.filter(pk=obj.pk).update(
        submitted_at=timezone.now() - timedelta(days=days, hours=1)
    )


class AdminOverviewBase(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.admin = User.objects.create_user("admin", password="x", is_staff=True)
        self.superuser = User.objects.create_superuser("root", password="x")
        self.client_obj = Client.objects.create(name="Acme", code="ACM")
        self.emp = User.objects.create_user("emp", password="x")

    def get(self, user=None):
        self.api.force_authenticate(user or self.admin)
        return self.api.get(URL)


class PermissionTests(AdminOverviewBase):
    def test_employee_forbidden(self):
        self.assertEqual(self.get(self.emp).status_code, status.HTTP_403_FORBIDDEN)

    def test_hr_forbidden(self):
        hr = User.objects.create_user("hr", password="x")
        hr.profile.is_hr_user = True
        hr.profile.save(update_fields=["is_hr_user"])
        self.assertEqual(self.get(hr).status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_ok(self):
        res = self.get()
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        for key in ("headcount", "coverage_gaps", "pending_backlog", "approval_aging",
                    "leave_utilization", "carryover_expiry", "period_close", "backup"):
            self.assertIn(key, res.data)

    def test_backup_hidden_from_non_superuser(self):
        self.assertIsNone(self.get(self.admin).data["backup"])
        self.assertIsNotNone(self.get(self.superuser).data["backup"])


class HeadcountTests(AdminOverviewBase):
    def test_counts(self):
        User.objects.filter(pk=self.emp.pk).update(last_login=timezone.now())
        User.objects.create_user("gone", password="x", is_active=False)
        h = self.get().data["headcount"]
        self.assertEqual(h["total_users"], 4)
        self.assertEqual(h["active_users"], 3)
        self.assertEqual(h["inactive_users"], 1)
        self.assertEqual(h["new_hires_30d"], 4)
        # emp logged in; admin/root never did; "gone" is inactive so excluded
        self.assertEqual(h["never_logged_in"], 2)


class CoverageGapTests(AdminOverviewBase):
    def test_teams_without_leader_and_users_without_team_or_tech(self):
        baseline = self.get().data["coverage_gaps"]["teams_without_leader"]
        Team.objects.create(name="NoLead", code="NL")
        gaps = self.get().data["coverage_gaps"]
        self.assertEqual(gaps["teams_without_leader"], baseline + 1)
        # emp is a plain employee with no team/tech; staff/superuser are excluded
        self.assertEqual(gaps["users_without_team"], 1)
        self.assertEqual(gaps["users_without_tech"], 1)
        self.assertEqual(gaps["employees_without_tl"], 1)

    def test_employee_with_tl_is_not_a_gap(self):
        tl = User.objects.create_user("tl", password="x")
        self.emp.profile.italian_tl = tl
        self.emp.profile.save(update_fields=["italian_tl"])
        self.assertEqual(self.get().data["coverage_gaps"]["employees_without_tl"], 1)  # tl herself

    def test_albanian_tl_without_open_hbpr_assignment(self):
        al = User.objects.create_user("al", password="x")
        al.profile.is_albanian_tl_role = True
        al.profile.save(update_fields=["is_albanian_tl_role"])
        self.assertEqual(self.get().data["coverage_gaps"]["al_tls_without_hbpr_assignment"], 1)
        hbpr = User.objects.create_user("hb", password="x")
        HbprAlbanianTlAssignment.objects.bulk_create([
            HbprAlbanianTlAssignment(
                hbpr=hbpr, albanian_tl=al, cadence="weekly",
                effective_from=date.today() - timedelta(days=1),
            )
        ])
        self.assertEqual(self.get().data["coverage_gaps"]["al_tls_without_hbpr_assignment"], 0)


class PendingBacklogTests(AdminOverviewBase):
    def test_hours_and_business_days(self):
        OvertimeLog.objects.create(user=self.emp, client=self.client_obj, date=date.today(), hours=Decimal("2.5"))
        OvertimeLog.objects.create(user=self.emp, client=self.client_obj, date=date.today(), hours=Decimal("9"), status="approved")
        StandbyLog.objects.create(user=self.emp, date=date.today(), hours=Decimal("4"))
        # Mon-Sun span = 5 business days, not 7
        monday = date(2026, 10, 5)
        LeaveRequest.objects.create(
            user=self.emp, request_type="vacation", start_date=monday, end_date=monday + timedelta(days=6)
        )
        b = self.get().data["pending_backlog"]
        self.assertEqual(b["overtime"], {"count": 1, "hours": 2.5})
        self.assertEqual(b["standby"], {"count": 1, "hours": 4.0})
        self.assertEqual(b["leave"], {"count": 1, "days": 5})


class ApprovalAgingTests(AdminOverviewBase):
    def test_buckets_by_type(self):
        ot = [OvertimeLog.objects.create(user=self.emp, client=self.client_obj, date=date.today(), hours=1) for _ in range(4)]
        for log, days in zip(ot, (0, 5, 10, 20)):
            _age(log, days)
        sb = StandbyLog.objects.create(user=self.emp, date=date.today(), hours=1)
        _age(sb, 16)
        lv = LeaveRequest.objects.create(
            user=self.emp, request_type="sick", start_date=date(2026, 10, 5), end_date=date(2026, 10, 5)
        )
        LeaveRequest.objects.filter(pk=lv.pk).update(submitted_at=None)  # falls back to created_at
        LeaveRequest.objects.filter(pk=lv.pk).update(created_at=timezone.now() - timedelta(days=9, hours=1))
        approved = OvertimeLog.objects.create(
            user=self.emp, client=self.client_obj, date=date.today(), hours=1, status="approved"
        )
        _age(approved, 30)

        aging = self.get().data["approval_aging"]
        self.assertEqual(aging["buckets"], ["0-3d", "4-7d", "8-14d", "15d+"])
        self.assertEqual(aging["overtime"], [1, 1, 1, 1])
        self.assertEqual(aging["standby"], [0, 0, 0, 1])
        self.assertEqual(aging["leave"], [0, 0, 1, 0])


class LeaveTests(AdminOverviewBase):
    def test_utilization_current_year_only(self):
        year = date.today().year
        LeaveBalance.objects.create(user=self.emp, leave_type="vacation", year=year,
                                    total_days=20, used_days=5, pending_days=3)
        LeaveBalance.objects.create(user=self.admin, leave_type="vacation", year=year - 1,
                                    total_days=99, used_days=99)
        u = self.get().data["leave_utilization"]
        self.assertEqual(u["total_days"], 20.0)
        self.assertEqual(u["used_days"], 5.0)
        self.assertEqual(u["pending_days"], 3.0)
        self.assertEqual(u["available_days"], 12.0)
        self.assertEqual(u["utilization_pct"], 25.0)

    def test_utilization_pct_none_without_balances(self):
        self.assertIsNone(self.get().data["leave_utilization"]["utilization_pct"])

    def test_carryover_expiry_window(self):
        today = date.today()
        year = today.year
        LeaveBalance.objects.create(user=self.emp, leave_type="vacation", year=year, is_carry_over=True,
                                    total_days=6, used_days=1, expires_at=today + timedelta(days=30))
        LeaveBalance.objects.create(user=self.admin, leave_type="vacation", year=year, is_carry_over=True,
                                    total_days=4, expires_at=today + timedelta(days=90))  # outside window
        LeaveBalance.objects.create(user=self.superuser, leave_type="vacation", year=year, is_carry_over=True,
                                    total_days=4, used_days=4, expires_at=today + timedelta(days=10))  # nothing left
        c = self.get().data["carryover_expiry"]
        self.assertEqual(c["days_at_risk"], 5.0)
        self.assertEqual(c["users_affected"], 1)


class PeriodCloseTests(AdminOverviewBase):
    def test_previous_month_tl_close_status(self):
        t1 = User.objects.create_user("t1", password="x")
        t2 = User.objects.create_user("t2", password="x")
        Team.objects.create(name="A", code="A", team_leader=t1)
        Team.objects.create(name="B", code="B", team_leader=t2)
        first = timezone.localdate().replace(day=1)
        prev = (first - timedelta(days=1)).replace(day=1)
        boundary = ApprovalPeriodBoundary.objects.create(period=prev)
        ApprovalPeriodClose.objects.create(
            boundary=boundary, closed_at=timezone.now(), closed_by=t1, scope_key=f"managed-user:{t1.pk}"
        )
        pc = self.get().data["period_close"]
        self.assertEqual(pc["period"], prev.strftime("%Y-%m"))
        self.assertEqual((pc["tls_total"], pc["tls_closed"], pc["tls_open"]), (2, 1, 1))
        self.assertEqual([t["id"] for t in pc["open_tls"]], [t2.pk])


class BackupTests(AdminOverviewBase):
    def test_superuser_sees_backup_age_and_staleness(self):
        from plugins.site_backup.models import BackupRecord

        rec = BackupRecord.objects.create(filename="b.zip", size_bytes=5 * 1024 * 1024, checksum="x" * 64,
                                          migration_state_hash="y" * 64, db_row_count=10)
        BackupRecord.objects.filter(pk=rec.pk).update(created_at=timezone.now() - timedelta(days=8))
        b = self.get(self.superuser).data["backup"]
        self.assertEqual(b["count"], 1)
        self.assertEqual(b["size_mb"], 5.0)
        self.assertTrue(b["stale"])

    def test_no_backups(self):
        b = self.get(self.superuser).data["backup"]
        self.assertEqual(b["count"], 0)
        self.assertTrue(b["stale"])
