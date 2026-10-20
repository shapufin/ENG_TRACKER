"""P-pass: the year-end rollover creates carry rows in bulk (query count does not grow with users)."""
from datetime import date

from django.contrib.auth.models import User
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.leave_management.models import GlobalSettings, LeaveBalance
from apps.leave_management.services.carry_over import apply_year_end_carry_over
from apps.leave_management.test_carry_over import CarryOverTestBase


class RolloverQueryBudgetTests(CarryOverTestBase):
    def _users_with_unused_days(self, count, start=0):
        for i in range(start, start + count):
            user = User.objects.create_user(username=f'rollover{i}', password='pw')
            self.balance(2025, total=22, used=2, user=user)

    def _rollover_queries(self):
        GlobalSettings.objects.filter(pk=1).update(carry_over_applied_year=None)
        LeaveBalance.objects.filter(is_carry_over=True).delete()
        with CaptureQueriesContext(connection) as ctx:
            counts = apply_year_end_carry_over(date(2026, 10, 13))
        return len(ctx.captured_queries), counts

    def test_rollover_query_count_does_not_grow_with_users(self):
        self._users_with_unused_days(2)
        few, counts = self._rollover_queries()
        self.assertEqual(counts['created'], 2)
        self._users_with_unused_days(10, start=2)
        many, counts = self._rollover_queries()
        self.assertEqual(counts['created'], 12)
        self.assertEqual(few, many, f'{few} queries (N=2) vs {many} (N=12)')
