"""PERF-09: measured query budget of payroll generate and finalize.

Decision record (2026-10-14):

* ``generate_draft_run`` keeps one ``PayrollLine.objects.create`` per user.
  ``PayrollLine.save()`` is the immutability guard for finalized runs and
  ``bulk_create`` would bypass it; the per-user cost is also dominated by the
  calculation-input queries, not the INSERT.
* ``finalize_run`` keeps the per-entry source lock, the source ``save`` (its
  audit-log signals are relied on) and ``PayrollRunEntry.save`` (the draft to
  finalized transition guard). Batching any of them would skip an invariant.

This test measures the real per-entry and per-user cost and fails if it grows.
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext

from apps.overtime.models import Client as OvertimeClient, OvertimeLog
from plugins.payroll.models import (
    PayrollConfiguration, PayrollRuleSet, PayrollRun, PayrollRunEntry, WageAssignment,
)
from plugins.payroll.services.payroll_service import finalize_run, generate_draft_run

User = get_user_model()

# Measured on 2026-10-14 (SQLite): generate 13 queries/user, finalize 9/entry.
# Ceilings carry ~30% headroom.
MAX_FINALIZE_QUERIES_PER_ENTRY = 12
MAX_GENERATE_QUERIES_PER_USER = 17


class PayrollGenerateFinalizeBudgetTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        PayrollConfiguration.objects.update_or_create(pk=1, defaults={'require_tl_closed_before_finalize': False})
        cls.admin = User.objects.create_superuser(username='gf_admin', email='gf@test.com', password='pass')
        call_command('seed_payroll_rules', verbosity=0)
        cls.rule_set = PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE')
        cls.client_obj = OvertimeClient.objects.create(name='GF Client', code='GFC')

    def _user(self, name):
        user = User.objects.create_user(username=name, password='pass')
        WageAssignment.objects.create(
            user=user, gross_monthly_wage=Decimal('100000'),
            effective_from=date(2026, 1, 1), is_active=True,
        )
        return user

    def _run(self, month, users, logs_per_user=0):
        for user in users:
            for day in range(logs_per_user):
                OvertimeLog.objects.create(
                    user=user, client=self.client_obj, date=date(2026, month, 3 + day), hours=2,
                    requested_processing_period=date(2026, month, 1), status='approved',
                )
        run = PayrollRun.objects.create(
            year=2026, month=month, status='draft', rule_set=self.rule_set, created_by=self.admin,
        )
        with CaptureQueriesContext(connection) as gen:
            generate_draft_run(run, users)
        return run, len(gen.captured_queries)

    def test_generate_cost_per_user_is_bounded(self):
        _, small = self._run(1, [self._user('gf-a1')])
        _, large = self._run(2, [self._user(f'gf-b{i}') for i in range(5)])
        self.assertLessEqual((large - small) / 4, MAX_GENERATE_QUERIES_PER_USER)

    def test_finalize_cost_per_entry_is_bounded(self):
        run_small, _ = self._run(3, [self._user('gf-c1')], logs_per_user=1)
        run_large, _ = self._run(4, [self._user('gf-d1')], logs_per_user=5)
        self.assertEqual(PayrollRunEntry.objects.filter(run=run_small).count(), 1)
        self.assertEqual(PayrollRunEntry.objects.filter(run=run_large).count(), 5)
        with CaptureQueriesContext(connection) as small:
            finalize_run(run_small, self.admin)
        with CaptureQueriesContext(connection) as large:
            finalize_run(run_large, self.admin)
        per_entry = (len(large.captured_queries) - len(small.captured_queries)) / 4
        self.assertLessEqual(per_entry, MAX_FINALIZE_QUERIES_PER_ENTRY, f'per entry: {per_entry}')
        self.assertFalse(PayrollRunEntry.objects.filter(run=run_large, status='draft').exists())

