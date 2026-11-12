"""Retention: notices, the purge gates and the superuser-confirmed purge of archived years."""
from datetime import date
from unittest.mock import patch

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.leave_management.models import LeaveBalance, LeaveRequest
from apps.leave_management.services import carry_over
from apps.overtime.models import OvertimeLog
from apps.reports.models import AuditLog
from plugins.engagement.models import TLApprovalMetric
from plugins.tl_scorecard.models import (
    EPRCycle, IdleFlag, ScorecardMonthSnapshot,
)
from plugins.year_close.notification_types import ArchiveRemovalNotice
from plugins.year_close.services import retention as svc
from plugins.year_close.services.closer import close_year
from plugins.year_close.test_year_close import YearCloseFixture

DISPATCH = 'plugins.year_close.notification_types.ArchiveRemovalNotice.dispatch'


class RetentionFixture(YearCloseFixture):
    def setUp(self):
        super().setUp()
        year = self.year
        self.notice_90 = date(year + 3, 11, 1)
        self.notice_30 = date(year + 3, 12, 5)
        self.purge_day = date(year + 4, 1, 20)
        self.add_overtime(status='rejected')
        self.add_standby(status='rejected')
        self.add_leave(status='approved')  # 10-11 June: fully inside the year
        self.spanning = LeaveRequest.objects.create(
            user=self.member, start_date=date(year, 12, 30), end_date=date(year + 1, 1, 2),
            request_type='vacation', status='approved', days_counted=2)
        self.balance_rows = LeaveBalance.objects.count()
        EPRCycle.objects.create(user=self.member, year=year)
        EPRCycle.objects.create(user=self.outsider, year=year - 1)
        for month in (3, 12):
            ScorecardMonthSnapshot.objects.create(
                leader=self.tl, month=date(year, month, 1), member_ids=[], payload={},
                computed_at=timezone.now())
        ScorecardMonthSnapshot.objects.create(
            leader=self.tl, month=date(year - 1, 12, 1), member_ids=[], payload={},
            computed_at=timezone.now())
        TLApprovalMetric.objects.create(
            leader=self.tl, team=self.team, month=date(year, 3, 1), team_size=1,
            computed_at=timezone.now())
        IdleFlag.objects.create(
            employee=self.member, flagged_by=self.tl, flagged_on=date(year, 5, 5))
        IdleFlag.objects.create(
            employee=self.member, flagged_by=self.tl, flagged_on=date(year - 1, 5, 5))
        self.snapshot = close_year(self.year)
        self.assertEqual(self.snapshot.status, 'ready', self.snapshot.readiness)
        settings_row = carry_over._settings()
        settings_row.carry_over_applied_year = year + 4
        settings_row.save()

    def send_notices(self):
        with patch(DISPATCH):
            svc.process_notices(today=self.notice_90)
            svc.process_notices(today=self.notice_30)


class NoticeTests(RetentionFixture):
    def test_each_stage_is_sent_once_and_only_when_due(self):
        with patch(DISPATCH) as dispatch:
            self.assertEqual(svc.process_notices(today=date(self.year + 3, 10, 1)), 0)
            self.assertEqual(svc.process_notices(today=self.notice_90), 1)
            self.assertEqual(svc.process_notices(today=self.notice_90), 0)
            self.assertEqual(svc.process_notices(today=self.notice_30), 1)
            self.assertEqual(svc.process_notices(today=self.notice_30), 0)
        self.assertEqual(dispatch.call_count, 2)
        context = dispatch.call_args.args[0]
        self.assertEqual((context['year'], context['group'], context['days']),
                         (self.year, 'standard', 30))

    def test_payroll_is_noticed_on_its_own_longer_schedule(self):
        with patch(DISPATCH) as dispatch:
            svc.process_notices(today=self.notice_30)
            groups = {call.args[0]['group'] for call in dispatch.call_args_list}
            self.assertEqual(groups, {'standard'})
            svc.process_notices(today=date(self.year + 5, 12, 5))
            groups = {call.args[0]['group'] for call in dispatch.call_args_list}
        self.assertIn('payroll', groups)

    def test_the_notice_goes_to_superusers_only(self):
        User.objects.create_user(username='nt_super', password='x', is_superuser=True)
        names = {u.username for u in ArchiveRemovalNotice().recipients({})}
        self.assertEqual(names, {'nt_super'})


class PurgeGateTests(RetentionFixture):
    def test_the_purge_refuses_until_the_date_and_the_final_notice(self):
        early = svc.check_purge(self.year, 'overtime', today=date(self.year + 3, 6, 1))
        self.assertTrue(any('kept until' in r.lower() for r in early), early)
        self.assertTrue(any('notice' in r.lower() for r in early), early)

    def test_a_tampered_or_missing_file_blocks_the_purge(self):
        self.send_notices()
        row = self.snapshot.files.filter(kind='company').first()
        path = self.root / row.relative_path
        path.write_bytes(path.read_bytes() + b'x')
        reasons = svc.check_purge(self.year, 'overtime', today=self.purge_day)
        self.assertTrue(any('verified' in r.lower() for r in reasons), reasons)

    def test_payroll_is_kept_longer_than_the_rest(self):
        self.send_notices()
        self.assertEqual(svc.check_purge(self.year, 'overtime', today=self.purge_day), [])
        payroll = svc.check_purge(self.year, 'payroll', today=self.purge_day)
        self.assertTrue(any('kept until' in r.lower() for r in payroll), payroll)

    def test_a_year_that_is_not_closed_is_never_purged(self):
        self.send_notices()
        from apps.users.models import ClosedYear
        ClosedYear.objects.filter(year=self.year).delete()
        reasons = svc.check_purge(self.year, 'overtime', today=self.purge_day)
        self.assertTrue(any('not closed' in r.lower() for r in reasons), reasons)


class PurgeTests(RetentionFixture):
    def setUp(self):
        super().setUp()
        self.send_notices()

    def test_a_dry_run_counts_and_changes_nothing(self):
        result = svc.purge(self.year, 'overtime', dry_run=True, today=self.purge_day)
        self.assertEqual(result['rows'], {'Overtime entries': 1})
        self.assertEqual(OvertimeLog.objects.count(), 1)
        self.assertNotIn('overtime', svc.read_ledger(self.year)['purged'])

    def test_applying_deletes_the_rows_records_the_ledger_and_cannot_repeat(self):
        user = User.objects.create_user(username='pg_super', password='x', is_superuser=True)
        svc.purge(self.year, 'overtime', actor=user, dry_run=False, today=self.purge_day)
        self.assertEqual(OvertimeLog.objects.count(), 0)
        entry = svc.read_ledger(self.year)['purged']['overtime']
        self.assertEqual((entry['rows'], entry['by']), ({'Overtime entries': 1}, 'pg_super'))
        with self.assertRaises(svc.PurgeRefused):
            svc.purge(self.year, 'overtime', dry_run=False, today=self.purge_day)
        self.assertTrue(AuditLog.objects.filter(
            extra_data__operation='archive_purge', object_id=str(self.year)).exists())

    def test_rows_restored_from_an_older_backup_can_be_removed_again(self):
        svc.purge(self.year, 'overtime', dry_run=False, today=self.purge_day)
        self.add_overtime(status='rejected')  # what a pre-purge database restore brings back
        result = svc.purge(self.year, 'overtime', dry_run=False, today=self.purge_day)
        self.assertEqual(result['rows'], {'Overtime entries': 1})
        self.assertEqual(OvertimeLog.objects.count(), 0)

    def test_leave_removes_only_requests_inside_the_year_and_keeps_balances(self):
        svc.purge(self.year, 'leave', dry_run=False, today=self.purge_day)
        self.assertTrue(LeaveRequest.objects.filter(pk=self.spanning.pk).exists())
        self.assertFalse(LeaveRequest.objects.filter(start_date=self.work_date).exists())
        self.assertEqual(LeaveBalance.objects.count(), self.balance_rows)

    def test_leave_waits_for_the_year_end_carry_over(self):
        settings_row = carry_over._settings()
        settings_row.carry_over_applied_year = None
        settings_row.save()
        reasons = svc.check_purge(self.year, 'leave', today=self.purge_day)
        self.assertTrue(any('carry-over' in r.lower() for r in reasons), reasons)

    def test_scorecard_engagement_epr_and_records_remove_only_that_year(self):
        for key in ('scorecard', 'engagement', 'epr', 'records'):
            svc.purge(self.year, key, dry_run=False, today=self.purge_day)
        self.assertEqual(list(ScorecardMonthSnapshot.objects.values_list('month__year', flat=True)),
                         [self.year - 1])
        self.assertEqual(TLApprovalMetric.objects.count(), 0)
        self.assertEqual(list(EPRCycle.objects.values_list('year', flat=True)), [self.year - 1])
        self.assertEqual(list(IdleFlag.objects.values_list('flagged_on__year', flat=True)),
                         [self.year - 1])


class PurgeApiTests(RetentionFixture):
    def setUp(self):
        super().setUp()
        self.send_notices()
        self.client = APIClient()
        self.staff = User.objects.create_user(username='pa_staff', password='x', is_staff=True)
        self.superuser = User.objects.create_user(
            username='pa_super', password='x', is_staff=True, is_superuser=True)
        patcher = patch('plugins.year_close.services.retention.business_today',
                        return_value=self.purge_day)
        patcher.start()
        self.addCleanup(patcher.stop)

    def post(self, **body):
        return self.client.post(
            '/api/plugins/year_close/archives/purge/',
            {'year': self.year, 'category': 'overtime', **body}, format='json')

    def test_staff_cannot_purge(self):
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.post().status_code, status.HTTP_403_FORBIDDEN)

    def test_a_superuser_previews_then_confirms(self):
        self.client.force_authenticate(self.superuser)
        preview = self.post()  # dry run is the default
        self.assertEqual(preview.status_code, status.HTTP_200_OK, preview.data)
        self.assertTrue(preview.data['dry_run'])
        self.assertEqual(OvertimeLog.objects.count(), 1)
        done = self.post(dry_run=False)
        self.assertEqual(done.status_code, status.HTTP_200_OK, done.data)
        self.assertFalse(done.data['dry_run'])
        self.assertEqual(OvertimeLog.objects.count(), 0)

    def test_a_refusal_lists_the_reasons(self):
        self.client.force_authenticate(self.superuser)
        response = self.post(category='payroll', dry_run=False)
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(response.data['reasons'])

    def test_the_archive_list_marks_removed_categories(self):
        self.client.force_authenticate(self.superuser)
        self.post(dry_run=False)
        entry = next(r for r in self.client.get('/api/plugins/year_close/archives/').data
                     if r['year'] == self.year)
        categories = {c['key']: c for c in entry['categories']}
        self.assertTrue(categories['overtime']['purged_at'])
        self.assertIsNone(categories['standby']['purged_at'])
        self.assertTrue(categories['overtime']['removable'])
        self.assertFalse(categories['payroll']['removable'])


class EveryCategoryTests(RetentionFixture):
    def test_every_category_plan_counts_without_error_and_removes_nothing(self):
        with patch(DISPATCH):
            svc.process_notices(today=date(self.year + 5, 12, 5))
        day = date(self.year + 6, 1, 20)
        for key in svc.KEYS:
            with self.subTest(category=key):
                result = svc.purge(self.year, key, dry_run=True, today=day)
                self.assertTrue(result['dry_run'])
        self.assertEqual(OvertimeLog.objects.count(), 1)


class PurgeCommandTests(RetentionFixture):
    def test_the_command_is_a_dry_run_and_apply_needs_the_phrase(self):
        from io import StringIO

        from django.core.management import call_command
        from django.core.management.base import CommandError

        out = StringIO()
        call_command('purge_expired_years', stdout=out)
        self.assertIn('skipped', out.getvalue())  # not due yet: every gate reports
        with self.assertRaises(CommandError):
            call_command('purge_expired_years', '--apply')
        self.assertEqual(OvertimeLog.objects.count(), 1)
