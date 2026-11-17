"""Scorecard months follow the Europe/Tirane calendar, like engagement (audit 2026-11-17 M8, D2).

Frozen months are never recomputed (snapshots are read once final), so the switch is
forward-only by construction.
"""
from datetime import date, datetime, timedelta, timezone as dt_timezone

from django.contrib.auth.models import User
from django.test import TestCase

from apps.leave_management.models import LeaveRequest
from core.utils.timezone_local import business_tz
from plugins.tl_scorecard.services import _business_days_elapsed, leave_sla_metrics

TIRANE = business_tz()


class BusinessMonthWindowTests(TestCase):
    def setUp(self):
        self.emp = User.objects.create_user('bm_emp', password='x')
        # 00:30 on 1 December in Tirane is still 30 November in UTC.
        self.submitted = datetime(2026, 12, 1, 0, 30, tzinfo=TIRANE)
        leave = LeaveRequest.objects.create(
            user=self.emp, start_date=date(2027, 1, 11), end_date=date(2027, 1, 12),
            request_type='vacation', status='approved', days_counted=2,
            approved_at=self.submitted + timedelta(hours=1),
        )
        LeaveRequest.objects.filter(pk=leave.pk).update(submitted_at=self.submitted)

    def test_a_request_submitted_just_after_midnight_counts_in_its_tirane_month(self):
        december = leave_sla_metrics([self.emp.id], date(2026, 12, 1))
        november = leave_sla_metrics([self.emp.id], date(2026, 11, 1))
        self.assertEqual((december['decided_count'], november['decided_count']), (1, 0))

    def test_elapsed_business_days_use_the_tirane_date(self):
        # Rows come back from the database in UTC. Submitted Tuesday 00:30 Tirane
        # (Monday 23:30 UTC), decided Wednesday 09:00 Tirane: one business day, not two.
        submitted = datetime(2026, 12, 8, 0, 30, tzinfo=TIRANE).astimezone(dt_timezone.utc)
        decided = datetime(2026, 12, 9, 9, 0, tzinfo=TIRANE).astimezone(dt_timezone.utc)
        self.assertEqual(_business_days_elapsed(submitted, decided), 1)
