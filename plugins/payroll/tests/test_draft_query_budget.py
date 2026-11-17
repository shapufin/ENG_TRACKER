"""L4 (audit 2026-11-16): measured cost of a draft run per user, pinned so growth is noticed."""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext

from plugins.payroll.models import PayrollConfiguration, PayrollRun, PayrollRuleSet, WageAssignment
from plugins.payroll.services.payroll_service import generate_draft_run

User = get_user_model()
# Marginal queries one more person costs in a draft run. Measured 2026-11-17 (see the test below).
MAX_QUERIES_PER_USER = 16  # measured 13.0 (2 users: 35 queries, 8 users: 113); a rise needs a reason


class DraftQueryBudgetTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        PayrollConfiguration.objects.update_or_create(pk=1, defaults={'require_tl_closed_before_finalize': False})
        call_command('seed_payroll_rules', verbosity=0)
        cls.admin = User.objects.create_superuser(username='qb_admin', email='a@t.com', password='x')
        cls.users = []
        for i in range(8):
            user = User.objects.create_user(username=f'qb_{i}', email=f'{i}@t.com', password='x')
            WageAssignment.objects.create(
                user=user, gross_monthly_wage=Decimal('100000'), effective_from=date(2026, 1, 1), is_active=True,
            )
            cls.users.append(user)

    def _queries(self, users):
        run = PayrollRun.objects.create(
            year=2026, month=6, status='draft',
            rule_set=PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE'), created_by=self.admin,
        )
        with CaptureQueriesContext(connection) as ctx:
            generate_draft_run(run, users)
        run.delete()
        return len(ctx)

    def test_one_more_person_costs_a_bounded_number_of_queries(self):
        few, many = self._queries(self.users[:2]), self._queries(self.users[:8])
        per_user = (many - few) / 6
        self.assertLessEqual(per_user, MAX_QUERIES_PER_USER)
