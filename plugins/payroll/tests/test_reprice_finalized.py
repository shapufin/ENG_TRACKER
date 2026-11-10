"""reprice_finalized_payroll: the audited exception to finalized immutability."""
import tempfile
from datetime import date, time
from decimal import Decimal
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from apps.overtime.models import Client as OvertimeClient, OvertimeLog
from plugins.payroll.models import (
    PayrollConfiguration, PayrollLine, PayrollRuleSet, PayrollRun, PayrollRunEntry,
    PayrollTaxBracket, WageAssignment,
)
from plugins.payroll.services.payroll_service import finalize_run, generate_draft_run

CONFIRM = ('--confirm', 'REPRICE-FINALIZED')


class RepriceFinalizedPayrollTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        PayrollConfiguration.objects.update_or_create(
            pk=1, defaults={'require_tl_closed_before_finalize': False, 'rounding_precision': 2},
        )
        User = get_user_model()
        cls.admin = User.objects.create_superuser(username='rp_admin', email='rp@test.com', password='x')
        call_command('seed_payroll_rules', verbosity=0)
        call_command('seed_payroll_banded_rules', effective_from='2026-12-01', verbosity=0)
        cls.target = PayrollRuleSet.objects.get(code='AL_BANDED_OT_2026_12')
        client = OvertimeClient.objects.create(name='RP Client', code='RPC')
        cls.employee = User.objects.create_user(username='rp-emp', password='x')
        WageAssignment.objects.create(
            user=cls.employee, gross_monthly_wage=Decimal('70000'),
            effective_from=date(2026, 1, 1), is_active=True,
        )
        for day, start, end in ((2, time(18), time(20)), (1, time(20), time(0))):
            OvertimeLog.objects.create(
                user=cls.employee, client=client, date=date(2026, 3, day), start_time=start,
                end_time=end, hours=1, requested_processing_period=date(2026, 3, 1),
                status='approved',
            )

    def setUp(self):
        self.run = PayrollRun.objects.create(
            year=2026, month=3, status='draft',
            rule_set=PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE'),
            created_by=self.admin,
        )
        generate_draft_run(self.run, [self.employee])
        finalize_run(self.run, self.admin)
        self.run.refresh_from_db()
        self.line_before = PayrollLine.objects.get(run=self.run)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def _call(self, *extra):
        out = StringIO()
        call_command('reprice_finalized_payroll', '--rule-set', self.target.code,
                     '--backup-dir', self.tmp.name, *extra, stdout=out)
        return out.getvalue()

    def _apply(self, *extra):
        return self._call('--apply', *CONFIRM, *extra)

    def test_dry_run_changes_nothing_and_reports_the_delta(self):
        output = self._call()
        self.assertIn('DRY RUN', output)
        self.assertIn('rp-emp', output)
        self.assertEqual(PayrollLine.objects.get(run=self.run).overtime_amount,
                         self.line_before.overtime_amount)
        self.run.refresh_from_db()
        self.assertNotEqual(self.run.rule_set_id, self.target.pk)
        self.assertEqual(list(Path(self.tmp.name).iterdir()), [])

    def test_apply_requires_the_confirmation_phrase(self):
        with self.assertRaises(CommandError):
            self._call('--apply')

    def test_apply_reprices_line_ledger_totals_and_rule_set(self):
        self._apply()
        line = PayrollLine.objects.get(run=self.run)
        self.assertEqual(line.overtime_amount, Decimal('1086.21') + Decimal('2977.01'))
        self.assertEqual(line.total_gross, Decimal('70000') + line.overtime_amount)
        self.assertNotEqual(line.net_pay, self.line_before.net_pay)
        self.assertEqual(line.rule_set_version, self.target.version)
        codes = {c['code'] for c in line.overtime_breakdown['categories']}
        self.assertEqual(codes, {'ot_day', 'ot_evening', 'wh_ot_evening', 'wh_ot_night'})
        ledger = PayrollRunEntry.objects.filter(run=self.run, source_kind='overtime')
        self.assertEqual(sum(e.overtime_amount for e in ledger).quantize(Decimal('0.01')),
                         line.overtime_amount)
        self.run.refresh_from_db()
        self.assertEqual(self.run.rule_set_id, self.target.pk)
        self.assertEqual(self.run.status, 'finalized')
        self.assertEqual(Decimal(str(self.run.totals['total_net'])), line.net_pay)

    def test_finalized_guards_still_hold_after_repricing(self):
        self._apply()
        line = PayrollLine.objects.get(run=self.run)
        line.net_pay = Decimal('1')
        with self.assertRaises(ValidationError):
            line.save()

    def test_backup_is_written_and_restore_puts_everything_back(self):
        self._apply()
        backups = list(Path(self.tmp.name).glob('reprice_*.json'))
        self.assertEqual(len(backups), 1)
        call_command('reprice_finalized_payroll', '--restore', str(backups[0]),
                     '--apply', *CONFIRM, stdout=StringIO())
        line = PayrollLine.objects.get(run=self.run)
        for name in ('overtime_amount', 'total_gross', 'net_pay', 'total_employer_cost'):
            self.assertEqual(getattr(line, name), getattr(self.line_before, name), name)
        self.assertEqual(line.overtime_breakdown, self.line_before.overtime_breakdown)
        self.run.refresh_from_db()
        self.assertNotEqual(self.run.rule_set_id, self.target.pk)

    def test_second_apply_skips_an_already_repriced_run(self):
        self._apply()
        output = self._apply()
        self.assertIn('already uses', output)
        self.assertEqual(len(list(Path(self.tmp.name).glob('reprice_*.json'))), 1)

    def test_closed_year_is_skipped(self):
        with patch('plugins.payroll.management.commands.reprice_finalized_payroll.is_year_closed',
                   return_value=True):
            output = self._apply()
        self.assertIn('closed', output)
        self.assertEqual(PayrollLine.objects.get(run=self.run).overtime_amount,
                         self.line_before.overtime_amount)

    def test_run_that_cannot_be_reproduced_is_skipped_untouched(self):
        PayrollLine.objects.filter(run=self.run).update(net_pay=Decimal('1.00'))
        output = self._apply()
        self.assertIn('cannot be reproduced', output)
        self.assertEqual(PayrollLine.objects.get(run=self.run).net_pay, Decimal('1.00'))

    def test_differing_tax_brackets_skip_the_run(self):
        PayrollTaxBracket.objects.filter(rule_set=self.target).update(rate=Decimal('0.99'))
        output = self._apply()
        self.assertIn('brackets differ', output)
        self.run.refresh_from_db()
        self.assertNotEqual(self.run.rule_set_id, self.target.pk)

    def test_month_range_filters_runs(self):
        self.assertIn('No finalized runs match', self._call('--from', '2026-04'))

    def test_target_must_be_a_banded_rule_set(self):
        with self.assertRaises(CommandError):
            call_command('reprice_finalized_payroll', '--rule-set', 'AL_2026_BOSHTI_REFERENCE',
                         stdout=StringIO())
