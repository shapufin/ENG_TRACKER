"""One implementation for request counts — every surface must agree.

Before 2026-10-31 each dashboard endpoint ran its own count aggregate:
``global_stats`` fed the KPI strip and the approval-queue status tab,
``admin_overview.pending_backlog`` fed the aging chips, and
``admin_overview.approval_aging`` fed the aging buckets. They agreed only by
coincidence of identical filters. ``aggregates.status_counts`` is now the one
implementation; these tests pin the agreement so a future edit cannot desync
the same number across three cards.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.dashboard.aggregates import status_counts
from apps.leave_management.models import LeaveRequest
from apps.overtime.models import Client, OvertimeLog
from apps.standby.models import StandbyLog

GLOBAL = "/api/dashboard/widgets/global_stats/"
OVERVIEW = "/api/dashboard/widgets/admin_overview/"
HR = "/api/dashboard/widgets/hr_overview/"


def _weekday(d):
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


class CountsAgreementTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.admin = User.objects.create_user("admin", password="x", is_staff=True)
        self.emp = User.objects.create_user("emp", password="x")
        self.client_obj = Client.objects.create(name="Acme", code="ACM")
        today = date.today()

        def ot(status, days_old=0):
            return OvertimeLog.objects.create(
                user=self.emp, client=self.client_obj, date=today, hours=Decimal("2"),
                status=status,
                submitted_at=timezone.now() - timedelta(days=days_old, hours=1),
            )

        ot("pending", 20)
        ot("pending", 2)
        ot("approved")
        ot("rejected")

        StandbyLog.objects.create(user=self.emp, date=today, hours=Decimal("3"),
                                  status="pending", submitted_at=timezone.now())
        StandbyLog.objects.create(user=self.emp, date=today, hours=Decimal("4"),
                                  status="approved", submitted_at=timezone.now())

        leave_day = _weekday(today + timedelta(days=7))
        LeaveRequest.objects.create(
            user=self.emp, request_type="vacation", status="pending",
            start_date=leave_day, end_date=leave_day, submitted_at=timezone.now(),
        )
        LeaveRequest.objects.create(
            user=self.emp, request_type="vacation", status="approved",
            start_date=_weekday(leave_day + timedelta(days=14)),
            end_date=_weekday(leave_day + timedelta(days=14)),
            submitted_at=timezone.now(),
        )

    def get(self, url):
        self.api.force_authenticate(self.admin)
        res = self.api.get(url)
        self.assertEqual(res.status_code, 200, res.data)
        return res.data

    def test_counts_are_what_the_fixture_says(self):
        counts = status_counts()
        self.assertEqual(counts["overtime"]["pending"], 2)
        self.assertEqual(counts["standby"]["pending"], 1)
        self.assertEqual(counts["leave"]["pending"], 1)
        self.assertEqual(counts["total"], {"pending": 4, "approved": 3, "rejected": 1})

    def test_global_stats_matches_status_counts(self):
        stats = self.get(GLOBAL)
        counts = status_counts()
        self.assertEqual(stats["pending_overtime"], counts["overtime"]["pending"])
        self.assertEqual(stats["pending_standby"], counts["standby"]["pending"])
        self.assertEqual(stats["pending_leaves"], counts["leave"]["pending"])
        self.assertEqual(stats["approved_overtime"], counts["overtime"]["approved"])
        self.assertEqual(stats["rejected_overtime"], counts["overtime"]["rejected"])

    def test_pending_backlog_counts_match_the_kpi_strip(self):
        """The aging chips and the KPI "Pending" must be the same numbers."""
        stats = self.get(GLOBAL)
        backlog = self.get(OVERVIEW)["pending_backlog"]
        self.assertEqual(backlog["overtime"]["count"], stats["pending_overtime"])
        self.assertEqual(backlog["standby"]["count"], stats["pending_standby"])
        self.assertEqual(backlog["leave"]["count"], stats["pending_leaves"])
        # Pending hours come from the same aggregate as the counts.
        self.assertEqual(backlog["overtime"]["hours"], 4.0)
        self.assertEqual(backlog["standby"]["hours"], 3.0)

    def test_aging_buckets_sum_to_the_same_pending_counts(self):
        overview = self.get(OVERVIEW)
        aging = overview["approval_aging"]
        backlog = overview["pending_backlog"]
        for key, field in (("overtime", "overtime"), ("standby", "standby"), ("leave", "leave")):
            self.assertEqual(
                sum(aging[field]),
                backlog[key]["count"],
                f"{key} aging buckets disagree with the backlog count",
            )

    def test_hr_pipeline_matches_the_admin_numbers(self):
        """HR and admin dashboards describe the same queue with the same counts."""
        stats = self.get(GLOBAL)
        hr = self.get(HR)["status_counts"]
        self.assertEqual(hr["pending"],
                         stats["pending_overtime"] + stats["pending_standby"] + stats["pending_leaves"])
        self.assertEqual(hr["approved"],
                         stats["approved_overtime"] + stats["approved_standby"] + stats["approved_leaves"])
        self.assertEqual(hr["rejected"],
                         stats["rejected_overtime"] + stats["rejected_standby"] + stats["rejected_leaves"])
