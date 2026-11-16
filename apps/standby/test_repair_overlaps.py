"""repair_standby_overlaps: trims the 'tail covered' pairs of the old weekly generator (Batch C)."""
import json
import tempfile
from datetime import date, time
from io import StringIO
from pathlib import Path

from django.contrib.auth.models import User
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from apps.standby.models import StandbyLog
from apps.users.models import ClosedYear
from apps.users.services.approval_periods import clear_closed_year_cache
from plugins.audit_log.models import AuditLog
from plugins.notifications.models import Notification

FRI = date(2026, 11, 6)
SAT = date(2026, 11, 7)
CONFIRM = 'REPAIR-STANDBY'


def make(user, day, start, end, status='approved'):
    log = StandbyLog.objects.create(user=user, date=day, start_time=start, end_time=end, hours=1, status=status)
    return log.pk


def reload(pk):
    return StandbyLog.objects.get(pk=pk)


class RepairStandbyOverlapsTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='rp_emp', password='x')
        self.backups = tempfile.mkdtemp()
        # Old generator pair: Friday 18:00-09:00 (15h) + Saturday 00:00-23:59 (24h).
        self.a = make(self.user, FRI, time(18, 0), time(9, 0))
        self.b = make(self.user, SAT, time(0, 0), time(23, 59))

    def run_cmd(self, *args):
        out = StringIO()
        call_command('repair_standby_overlaps', '--month', '2026-11', '--backup-dir', self.backups, *args, stdout=out)
        return out.getvalue()

    def apply(self):
        return self.run_cmd('--apply', '--confirm', CONFIRM)

    def test_dry_run_changes_nothing(self):
        report = self.run_cmd()
        self.assertEqual(reload(self.a).hours, 15)
        self.assertIn('DRY RUN', report)
        self.assertIn('1 fixable', report)
        self.assertEqual(list(Path(self.backups).iterdir()), [])

    def test_apply_trims_a_to_midnight_and_leaves_b(self):
        self.apply()
        a = reload(self.a)
        self.assertEqual((a.end_time, a.hours), (time(0, 0), 6))
        b = reload(self.b)
        self.assertEqual((b.start_time, b.end_time, b.hours), (time(0, 0), time(23, 59), 24))
        self.assertEqual(a.status, 'approved')

    def test_wrong_confirm_text_refuses(self):
        with self.assertRaises(CommandError):
            self.run_cmd('--apply', '--confirm', 'nope')
        self.assertEqual(reload(self.a).hours, 15)

    def test_only_the_requested_month_is_touched(self):
        october = make(self.user, date(2026, 10, 9), time(18, 0), time(9, 0))
        make(self.user, date(2026, 10, 10), time(0, 0), time(23, 59))
        self.apply()
        self.assertEqual(reload(october).hours, 15)  # October is out of scope

    def test_second_apply_is_a_no_op(self):
        self.apply()
        report = self.apply()
        self.assertIn('0 fixable', report)
        self.assertEqual(reload(self.a).hours, 6)

    def test_no_notification_and_one_audit_row(self):
        before = Notification.objects.count()
        self.apply()
        self.assertEqual(Notification.objects.count(), before)
        self.assertEqual(AuditLog.objects.filter(action='standby_overlap_repaired').count(), 1)

    def test_finalized_pair_is_reported_not_changed(self):
        self._finalize(self.a)
        report = self.apply()
        self.assertEqual(reload(self.a).hours, 15)
        self.assertIn('needs a human', report.lower())
        self.assertIn('paid', report.lower())

    def test_closed_year_pair_is_reported_not_changed(self):
        from django.utils import timezone

        ClosedYear.objects.create(year=2026, closed_at=timezone.now())
        self.addCleanup(clear_closed_year_cache)
        clear_closed_year_cache()
        report = self.apply()
        self.assertEqual(reload(self.a).hours, 15)
        self.assertIn('closed', report.lower())

    def test_odd_shapes_are_reported_only(self):
        other = User.objects.create_user(username='rp_odd', password='x')
        same_day_a = make(other, FRI, time(9, 0), time(17, 0))
        same_day_b = make(other, FRI, time(16, 0), time(20, 0))
        partial_a = make(other, date(2026, 11, 10), time(18, 0), time(9, 0))
        make(other, date(2026, 11, 11), time(2, 0), time(5, 0))  # B does not start at 00:00
        report = self.apply()
        self.assertEqual(reload(same_day_a).end_time, time(17, 0))
        self.assertEqual(reload(same_day_b).start_time, time(16, 0))
        self.assertEqual(reload(partial_a).hours, 15)
        self.assertIn('needs a human', report.lower())

    def test_rejected_and_deleted_rows_are_ignored(self):
        StandbyLog.objects.filter(pk=self.b).update(status='rejected')
        report = self.run_cmd()
        self.assertIn('0 fixable', report)
        StandbyLog.objects.filter(pk=self.b).update(status='approved', is_deleted=True)
        self.assertIn('0 fixable', self.run_cmd())

    def test_restore_brings_back_15h(self):
        self.apply()
        backup = next(Path(self.backups).iterdir())
        self.assertEqual(json.loads(backup.read_text())['rows'][0]['old_hours'], '15.00')
        call_command('repair_standby_overlaps', '--restore', str(backup), '--apply', '--confirm', CONFIRM, stdout=StringIO())
        a = reload(self.a)
        self.assertEqual((a.end_time, a.hours), (time(9, 0), 15))

    def test_restore_refuses_a_row_changed_since(self):
        self.apply()
        backup = next(Path(self.backups).iterdir())
        StandbyLog.objects.filter(pk=self.a).update(hours=5)
        out = StringIO()
        call_command('repair_standby_overlaps', '--restore', str(backup), '--apply', '--confirm', CONFIRM, stdout=out)
        self.assertEqual(reload(self.a).hours, 5)
        self.assertIn('SKIPPED', out.getvalue())

    def test_after_repair_the_old_row_can_be_edited_again(self):
        from core.utils.time_overlap import find_overlapping_entry

        self.apply()
        self.assertIsNone(find_overlapping_entry(
            StandbyLog.objects.all(), self.user.id, FRI, time(18, 0), time(0, 0), exclude_pk=self.a,
        ))

    def test_draft_runs_containing_a_changed_row_are_listed(self):
        run_id = self._entry(self.a, 'draft')
        report = self.apply()
        self.assertIn(f'run {run_id}', report.lower())

    # -- helpers -------------------------------------------------------------------
    def _entry(self, pk, status):
        from plugins.payroll.models import PayrollLine, PayrollRuleSet, PayrollRun, PayrollRunEntry

        rule_set = PayrollRuleSet.objects.create(code='RP_RULES', name='r', effective_from=date(2026, 1, 1))
        run = PayrollRun.objects.create(year=2026, month=11, status='draft', rule_set=rule_set)
        line = PayrollLine.objects.create(run=run, user=self.user, gross_monthly_wage=100000)
        entry = PayrollRunEntry(
            run=run, line=line, source_kind='standby', source_id=pk, status=status, work_date=FRI, user=self.user,
            requested_period=date(2026, 11, 1), resolved_period=date(2026, 11, 1),
        )
        PayrollRunEntry.objects.bulk_create([entry])
        return run.pk

    def _finalize(self, pk):
        self._entry(pk, 'finalized')
