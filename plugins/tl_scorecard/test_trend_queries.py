"""The trend must not recompute month-independent metrics for every point."""
from datetime import date

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext

from .scope import scoreable_member_ids
from .services import scorecard_trend
from .testing import make_user


class TrendQueryTests(TestCase):
    def setUp(self):
        self.leader = make_user('trend_leader')

    def _queries(self, months):
        scoreable_member_ids(self.leader)  # same warm state for both measurements
        with CaptureQueriesContext(connection) as ctx:
            scorecard_trend(self.leader, months, date(2026, 9, 1))
        return len(ctx)

    def test_extra_months_cost_far_less_than_a_full_scorecard_each(self):
        one, six = self._queries(1), self._queries(6)
        self.assertLess(six, one * 4, f'1 month={one} queries, 6 months={six}')
