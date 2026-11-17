"""Reopen, re-close and the purge guards (audit 2026-11-17 C1, owner decision D3)."""
import json
from datetime import date
from unittest.mock import patch

from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APIClient

from apps.overtime.models import OvertimeLog
from apps.users.models import ClosedYear
from apps.users.services.approval_periods import reopen_year
from plugins.year_close.services import builder
from plugins.year_close.services import retention as svc
from plugins.year_close.services.closer import close_year, latest_snapshot, process_close_year
from plugins.year_close.test_retention import RetentionFixture


def bundle_counts(snapshot):
    import zipfile

    totals = {}
    for row in snapshot.files.filter(kind__in=('team', 'unassigned')):
        with zipfile.ZipFile(builder.snapshot_root() / row.relative_path) as archive:
            for key, value in json.loads(archive.read('MANIFEST.json'))['counts'].items():
                totals[key] = totals.get(key, 0) + value
    return totals


class ReopenTests(RetentionFixture):
    def reopen_and_add_a_row(self):
        reopen_year(self.year, reason='correction')
        OvertimeLog.objects.create(
            user=self.member, client=self.client_row, date=date(self.year, 7, 1),
            hours=3, status='rejected',
        )

    def test_the_scheduler_rebuilds_a_reopened_year_as_a_new_version(self):
        self.reopen_and_add_a_row()
        process_close_year()
        snapshot = latest_snapshot(self.year)
        self.assertEqual((snapshot.status, snapshot.version), ('ready', 2))
        self.assertTrue(ClosedYear.objects.filter(year=self.year).exists())
        self.assertEqual(bundle_counts(snapshot)['overtime'], 2)
        self.snapshot.refresh_from_db()
        self.assertEqual(self.snapshot.status, 'superseded')

    def test_a_manual_close_after_a_reopen_also_rebuilds(self):
        self.reopen_and_add_a_row()
        snapshot = close_year(self.year)
        self.assertEqual((snapshot.status, snapshot.version), ('ready', 2))
        self.assertEqual(bundle_counts(snapshot)['overtime'], 2)

    def test_a_frozen_ready_year_is_left_alone(self):
        self.assertEqual(close_year(self.year).version, 1)
        process_close_year()
        self.assertEqual(latest_snapshot(self.year).version, 1)


class PurgeContentGuardTests(RetentionFixture):
    def test_a_purge_refuses_when_the_archive_counts_differ_from_the_database(self):
        self.send_notices()
        # A row the archive never saw (written behind the lock, e.g. a raw restore).
        OvertimeLog.objects.bulk_create([OvertimeLog(
            user=self.member, client=self.client_row, date=date(self.year, 8, 1),
            hours=1, status='rejected',
        )])
        reasons = svc.check_purge(self.year, 'overtime', today=self.purge_day)
        self.assertTrue(any('archive holds 1' in r for r in reasons), reasons)

    def test_a_rebuilt_set_needs_a_superuser_confirmation_before_any_purge(self):
        reopen_year(self.year, reason='correction')
        process_close_year()
        self.send_notices()
        reasons = svc.check_purge(self.year, 'overtime', today=self.purge_day)
        self.assertTrue(any('confirm' in r.lower() for r in reasons), reasons)

        admin = User.objects.create_superuser('rg_super', 'r@x.test', 'x')
        svc.confirm_snapshot(self.year, actor=admin)
        self.assertEqual(svc.check_purge(self.year, 'overtime', today=self.purge_day), [])
        self.assertEqual(svc.read_ledger(self.year)['confirmed_snapshot']['version'], 2)

    def test_the_first_set_needs_no_confirmation(self):
        self.send_notices()
        self.assertEqual(svc.check_purge(self.year, 'overtime', today=self.purge_day), [])


class ConfirmSetApiTests(RetentionFixture):
    def setUp(self):
        super().setUp()
        reopen_year(self.year, reason='correction')
        process_close_year()
        self.api = APIClient()

    def test_only_a_superuser_confirms_and_it_is_audited(self):
        from apps.reports.models import AuditLog

        staff = User.objects.create_user('rg_staff', password='x', is_staff=True)
        self.api.force_authenticate(staff)
        url = '/api/plugins/year_close/archives/confirm-set/'
        self.assertEqual(self.api.post(url, {'year': self.year}, format='json').status_code,
                         status.HTTP_403_FORBIDDEN)

        admin = User.objects.create_superuser('rg_super2', 'r2@x.test', 'x')
        self.api.force_authenticate(admin)
        response = self.api.post(url, {'year': self.year}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(response.data['version'], 2)
        self.assertTrue(AuditLog.objects.filter(
            extra_data__operation='archive_set_confirmed').exists())

    def test_the_archives_list_says_when_confirmation_is_needed(self):
        admin = User.objects.create_superuser('rg_super3', 'r3@x.test', 'x')
        self.api.force_authenticate(admin)
        entry = self.api.get('/api/plugins/year_close/archives/').data[0]
        self.assertTrue(entry['needs_confirmation'])
        with patch('plugins.year_close.services.archive_view.verify_file', return_value='ok'):
            self.api.post('/api/plugins/year_close/archives/confirm-set/',
                          {'year': self.year}, format='json')
        entry = self.api.get('/api/plugins/year_close/archives/').data[0]
        self.assertFalse(entry['needs_confirmation'])


class PayrollHoldsOvertimeTests(RetentionFixture):
    """Overtime and standby stay while finalized payroll still points at them (L7).

    ``PayrollRunEntry.source_id`` is a plain integer, so nothing in the database stops the
    purge; the payroll Excel's paid-block sheet then silently skipped the missing rows.
    """

    def test_overtime_is_kept_until_the_payroll_that_paid_it_is_removed(self):
        from plugins.payroll.models import PayrollLine, PayrollRuleSet, PayrollRun, PayrollRunEntry

        self.send_notices()
        row = OvertimeLog.objects.filter(date__year=self.year).first()
        rules = PayrollRuleSet.objects.create(name='RG', effective_from=date(self.year, 1, 1))
        run = PayrollRun.objects.create(year=self.year, month=6, status='draft', rule_set=rules)
        line = PayrollLine.objects.create(run=run, user=self.member)
        PayrollRunEntry.objects.create(
            run=run, line=line, source_kind='overtime', source_id=row.pk, user=self.member,
            work_date=row.date, requested_period=date(self.year, 6, 1),
            resolved_period=date(self.year, 6, 1), status='finalized',
        )
        PayrollRun.objects.filter(pk=run.pk).update(status='finalized')

        reasons = svc.check_purge(self.year, 'overtime', today=self.purge_day)
        self.assertTrue(any('payroll' in r.lower() and 'kept until' in r.lower() for r in reasons), reasons)
        self.assertFalse(svc.category_state(self.year, 'overtime', today=self.purge_day)['removable'])
        self.assertEqual(svc.check_purge(self.year, 'standby', today=self.purge_day), [])
