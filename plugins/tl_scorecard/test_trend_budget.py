"""PERF-13: the 12 and 24 month trend stays under the plan's 200-query ceiling.

Measured 2026-10-14 with a 5-member team: 12 months 106 -> 86 queries and 24 months
202 -> 160 after the two calendar-year metrics were shared per year."""
from datetime import date

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext

from .scope import scoreable_member_ids
from .models import PromotionFlag, ReviewDelivery
from .services import build_scorecard, scorecard_trend
from .testing import make_user

MAX_TREND_QUERIES = 200


class TrendBudgetTests(TestCase):
    def setUp(self):
        self.leader = make_user('trend_budget_leader')
        for i in range(5):  # a populated team, not just an empty leader
            member = make_user(f'trend_budget_member{i}')
            member.profile.italian_tl = self.leader
            member.profile.save(update_fields=['italian_tl'])

    def _queries(self, months):
        scoreable_member_ids(self.leader)
        with CaptureQueriesContext(connection) as ctx:
            scorecard_trend(self.leader, months, date(2026, 9, 1))
        return len(ctx)

    def test_twelve_and_twenty_four_months_stay_under_the_ceiling(self):
        twelve, twentyfour = self._queries(12), self._queries(24)
        self.assertLessEqual(twelve, MAX_TREND_QUERIES)
        self.assertLessEqual(twentyfour, MAX_TREND_QUERIES)


class TrendValuesMatchPerMonthTests(TestCase):
    """The shared-calendar-year trend must equal building each month on its own
    (the pre-change formula): same review/promotion counts for every month."""

    def setUp(self):
        self.leader = make_user('trend_values_leader')
        self.members = []
        for i in range(4):
            member = make_user(f'trend_values_member{i}')
            member.profile.italian_tl = self.leader
            member.profile.save(update_fields=['italian_tl'])
            self.members.append(member)
        for delivered in (date(2024, 11, 5), date(2025, 1, 9), date(2025, 6, 2),
                          date(2025, 6, 20), date(2026, 3, 1), date(2026, 8, 30)):
            ReviewDelivery.objects.create(
                leader=self.leader, period=delivered.strftime('%Y-%m'),
                recipient='Ops', delivered_on=delivered,
            )
        for member, decided in zip(self.members, (date(2025, 4, 1), date(2026, 2, 1), date(2026, 5, 1))):
            PromotionFlag.objects.create(
                employee=member, nominated_by=self.leader, nominated_on=decided,
                status='promoted', decided_on=decided,
            )

    def test_trend_equals_independent_per_month_scorecards(self):
        months = 24
        trend = scorecard_trend(self.leader, months, date(2026, 9, 1))
        self.assertEqual(len(trend), months)
        for point in trend:
            reference = build_scorecard(self.leader, date.fromisoformat(point['month']))
            self.assertEqual(point, reference, point['month'])
        # guard against a vacuous pass: the fixture really spans different values
        self.assertGreater(len({p['review_deliveries_ytd'] for p in trend}), 2)
        self.assertGreater(len({p['promotion']['promoted_count'] for p in trend}), 1)


class TiranaTodayTests(TestCase):
    """Service clocks use the Europe/Tirane date, not the server-local one."""

    def test_default_period_and_sla_clocks_read_business_today(self):
        from unittest.mock import patch

        from .services import absence_metrics, escalation_candidates, reporting_period

        leader = make_user('tirana-leader')
        with patch('plugins.tl_scorecard.services.business_today', return_value=date(2031, 7, 15)) as clock:
            self.assertEqual(reporting_period(None), date(2031, 7, 1))
            absence_metrics(set())
            escalation_candidates(leader)
        self.assertEqual(clock.call_count, 3)


class TrendWindowedMetricsTests(TestCase):
    """Leave, overtime and meeting rows are read once for the whole trend window,
    not once per month, and every point still equals its stand-alone scorecard."""

    def setUp(self):
        from datetime import datetime, time, timedelta, timezone as utc

        from apps.leave_management.models import LeaveRequest
        from apps.overtime.models.core import Client, OvertimeLog

        from .models import Meeting, MeetingAttendee

        self.leader = make_user('window_leader')
        self.members = []
        for i in range(3):
            member = make_user(f'window_member{i}')
            member.profile.italian_tl = self.leader
            member.profile.save(update_fields=['italian_tl'])
            self.members.append(member)
        client = Client.objects.create(name='Acme', code='ACME')
        for index, month in enumerate((4, 5, 6, 7, 8, 9)):
            submitted = datetime(2026, month, 3, 22, 30, tzinfo=utc.utc)  # late evening: UTC/Tirane day edge
            approved = submitted + timedelta(days=index)
            member = self.members[index % 3]
            leave = LeaveRequest.objects.create(
                user=member, request_type='vacation', status='approved',
                start_date=date(2026, month, 24), end_date=date(2026, month, 25),
            )
            LeaveRequest.objects.filter(pk=leave.pk).update(submitted_at=submitted, approved_at=approved)
            log = OvertimeLog.objects.create(
                user=member, client=client, date=date(2026, month, 3), hours=2,
                start_time=time(18, 0), end_time=time(20, 0), status='approved',
            )
            OvertimeLog.objects.filter(pk=log.pk).update(submitted_at=submitted, approved_at=approved)
            Meeting.objects.create(
                meeting_type='one_on_one', organizer=self.leader, counterparty=member,
                occurred_on=date(2026, month, 1 if month % 2 else 28),
            )
            team_meeting = Meeting.objects.create(
                meeting_type='team_meeting', organizer=self.leader, occurred_on=date(2026, month, 10),
            )
            MeetingAttendee.objects.create(meeting=team_meeting, user=member, role='hrbp')
        LeaveRequest.objects.create(
            user=self.members[0], request_type='vacation', status='pending',
            start_date=date(2026, 10, 5), end_date=date(2026, 10, 6),
        )

    def test_trend_equals_independent_per_month_scorecards(self):
        trend = scorecard_trend(self.leader, 6, date(2026, 9, 1))
        for point in trend:
            self.assertEqual(point, build_scorecard(self.leader, date.fromisoformat(point['month'])), point['month'])
        self.assertTrue(any(p['leave']['decided_count'] for p in trend))  # not a vacuous pass
        self.assertTrue(any(p['overtime']['decided_count'] for p in trend))
        self.assertTrue(any(p['meetings']['team_meetings_with_hrbp'] for p in trend))

    def test_six_month_trend_reads_each_table_once(self):
        scoreable_member_ids(self.leader)
        with CaptureQueriesContext(connection) as ctx:
            scorecard_trend(self.leader, 6, date(2026, 9, 1))
        self.assertLessEqual(len(ctx), 20, [q['sql'][:80] for q in ctx.captured_queries])
