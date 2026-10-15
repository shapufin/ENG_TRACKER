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

    def test_default_period_and_sla_clocks_read_tirana_today(self):
        from unittest.mock import patch

        from .services import absence_metrics, escalation_candidates, reporting_period

        leader = make_user('tirana-leader')
        with patch('plugins.tl_scorecard.services.tirana_today', return_value=date(2031, 7, 15)) as clock:
            self.assertEqual(reporting_period(None), date(2031, 7, 1))
            absence_metrics(set())
            escalation_candidates(leader)
        self.assertEqual(clock.call_count, 3)
