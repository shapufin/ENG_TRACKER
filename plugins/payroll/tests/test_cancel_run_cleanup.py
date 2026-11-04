"""A cancelled run is a tombstone: no lines, no draft inclusion rows, no totals."""
from datetime import date
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from apps.overtime.models import Client as OvertimeClient, OvertimeLog
from plugins.payroll.models import (
    PayrollConfiguration, PayrollLine, PayrollRuleSet, PayrollRun, PayrollRunEntry, WageAssignment,
)
from plugins.payroll.services.payroll_service import cancel_run, generate_draft_run

User = get_user_model()


class CancelRunCleanupTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        PayrollConfiguration.objects.update_or_create(
            pk=1, defaults={'require_tl_closed_before_finalize': False},
        )
        call_command('seed_payroll_rules', verbosity=0)
        cls.admin = User.objects.create_superuser('cancel_admin', password='x')
        cls.employee = User.objects.create_user('cancel_emp', password='x')
        WageAssignment.objects.create(
            user=cls.employee, gross_monthly_wage=Decimal('100000'),
            effective_from=date(2026, 1, 1), is_active=True,
        )
        cls.client_row = OvertimeClient.objects.create(name='Cancel Client', code='CC')

    def _run_with_entry(self, month):
        entry = OvertimeLog.objects.create(
            user=self.employee, client=self.client_row, date=date(2026, month, 15), hours=2,
            requested_processing_period=date(2026, month, 1), status='approved',
        )
        run = PayrollRun.objects.create(
            year=2026, month=month, status='draft', created_by=self.admin,
            rule_set=PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE'),
        )
        generate_draft_run(run, [self.employee])
        return run, entry

    def test_cancel_removes_lines_draft_entries_and_totals_but_keeps_the_run(self):
        run, entry = self._run_with_entry(3)
        self.assertTrue(run.lines.exists())
        self.assertTrue(PayrollRunEntry.objects.filter(run=run, status='draft').exists())

        cancel_run(run, self.admin)

        run.refresh_from_db()
        self.assertEqual(run.status, 'cancelled')
        self.assertEqual(run.totals, {})
        self.assertFalse(PayrollLine.objects.filter(run=run).exists())
        self.assertFalse(PayrollRunEntry.objects.filter(run=run).exists())

    def test_cancelled_run_no_longer_blocks_deleting_its_source_entry(self):
        run, entry = self._run_with_entry(4)
        cancel_run(run, self.admin)
        self.assertFalse(
            PayrollRunEntry.objects.filter(source_kind='overtime', source_id=entry.pk).exists(),
            'a leftover draft row makes the overtime viewset refuse to delete the entry',
        )

    def test_cancel_leaves_other_runs_alone(self):
        other, _ = self._run_with_entry(5)
        run, _ = self._run_with_entry(6)
        cancel_run(run, self.admin)
        self.assertTrue(other.lines.exists())
        self.assertTrue(PayrollRunEntry.objects.filter(run=other, status='draft').exists())

    def test_purge_command_cleans_runs_cancelled_before_the_fix_and_is_repeatable(self):
        run, _ = self._run_with_entry(7)
        PayrollRun.objects.filter(pk=run.pk).update(status='cancelled')  # the old cancel_run
        live, _ = self._run_with_entry(8)

        call_command('purge_cancelled_run_leftovers', stdout=StringIO())
        call_command('purge_cancelled_run_leftovers', stdout=StringIO())

        self.assertFalse(PayrollLine.objects.filter(run=run).exists())
        self.assertFalse(PayrollRunEntry.objects.filter(run=run).exists())
        self.assertTrue(PayrollLine.objects.filter(run=live).exists())
