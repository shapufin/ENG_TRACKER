"""Review follow-ups: failure alerting, hook isolation, draft user set, HR importer lock."""
from datetime import date, datetime
from decimal import Decimal
from unittest import mock
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from apps.users.models import ApprovalPeriodClose
from apps.users.services.approval_periods import finalize_period
from plugins.data_import.importers.payroll_draft import generate_draft_runs_for_periods
from plugins.notifications.models import Notification
from plugins.payroll import signals
from plugins.payroll.models import PayrollConfiguration, PayrollRun, WageAssignment
from plugins.payroll.services.payroll_service import payroll_lifecycle_tick

User = get_user_model()
TIRANE = ZoneInfo('Europe/Tirane')
MONTH_END = datetime(2026, 10, 30, 9, 0, tzinfo=TIRANE)
AT_CUTOFF = datetime(2026, 11, 5, 0, 0, tzinfo=TIRANE)


def _wage(user):
    WageAssignment.objects.create(
        user=user, gross_monthly_wage=Decimal('100000'),
        effective_from=date(2026, 1, 1), is_active=True,
    )


class LifecycleReviewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        PayrollConfiguration.objects.update_or_create(
            pk=1, defaults={'require_tl_closed_before_finalize': True},
        )
        call_command('seed_payroll_rules', verbosity=0)
        cls.leader = User.objects.create_user('lm', password='x')
        cls.staffer = User.objects.create_user('staffer', password='x')
        cls.staffer.profile.albanian_tl = cls.leader
        cls.staffer.profile.save(update_fields=['albanian_tl'])
        cls.admin = User.objects.create_user('adm', password='x', is_staff=True)
        cls.hr = User.objects.create_user('hr1', password='x')
        cls.hr.profile.is_hr_user = True
        cls.hr.profile.save(update_fields=['is_hr_user'])
        _wage(cls.staffer)

    def test_failed_finalize_alerts_hr_and_administrators_once(self):
        payroll_lifecycle_tick(MONTH_END)
        with mock.patch(
            'plugins.payroll.services.payroll_service.finalize_run', side_effect=RuntimeError('boom'),
        ), self.assertLogs('plugins.payroll.services.payroll_service', level='ERROR'):
            payroll_lifecycle_tick(AT_CUTOFF)
            payroll_lifecycle_tick(AT_CUTOFF)
        alerts = Notification.objects.filter(dedupe_key__startswith='hr-payroll-auto-failed:')
        self.assertEqual({n.user for n in alerts}, {self.hr, self.admin})
        self.assertEqual(alerts.count(), 2)
        self.assertIn('boom', alerts[0].message)

    def test_a_broken_hook_never_reaches_the_leaders_request(self):
        with mock.patch(
            'plugins.payroll.services.payroll_service.advance_payroll_period',
            side_effect=RuntimeError('boom'),
        ), self.assertLogs('plugins.payroll.signals', level='ERROR'):
            with mock.patch('django.utils.timezone.now', return_value=MONTH_END):
                close, _ = finalize_period(self.leader, date(2026, 10, 1))
            signals.advance_period_after_close(close.pk)  # must not raise
        self.assertTrue(ApprovalPeriodClose.objects.filter(pk=close.pk).exists())

    def test_cutoff_does_not_widen_the_draft_to_users_added_later(self):
        payroll_lifecycle_tick(MONTH_END)
        newcomer = User.objects.create_user('newcomer', password='x')
        _wage(newcomer)
        payroll_lifecycle_tick(AT_CUTOFF)
        run = PayrollRun.objects.get(month=10)
        self.assertEqual(run.status, 'finalized')
        self.assertEqual(set(run.lines.values_list('user__username', flat=True)), {'staffer'})

    def test_hr_cannot_create_runs_through_the_importer(self):
        result = generate_draft_runs_for_periods({(2026, 10): {self.staffer}}, self.hr)
        self.assertFalse(result['attempted'])
        self.assertFalse(PayrollRun.objects.exists())

    def test_an_administrator_can_still_create_runs_through_the_importer(self):
        result = generate_draft_runs_for_periods({(2026, 10): {self.staffer}}, self.admin)
        self.assertEqual([r['period'] for r in result['runs_created']], ['2026-10'])
