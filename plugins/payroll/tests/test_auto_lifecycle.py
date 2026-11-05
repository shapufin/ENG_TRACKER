"""Automatic payroll lifecycle: month-end draft, urgent reminders, early and cutoff finalize."""
from datetime import date, datetime
from decimal import Decimal
from unittest import mock
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from apps.dashboard.models.calendar import PublicHoliday
from apps.users.models import ApprovalPeriodClose
from apps.users.services.approval_periods import finalize_period
from plugins.notifications.models import Notification
from plugins.payroll import signals
from plugins.payroll.plugin import PayrollPlugin
from plugins.payroll.models import PayrollConfiguration, PayrollRun, WageAssignment
from plugins.payroll.services.payroll_service import advance_payroll_period, payroll_lifecycle_tick

User = get_user_model()
TIRANE = ZoneInfo('Europe/Tirane')
# 2026-10-31 is a Saturday: the last working day of October is Friday the 30th.
BEFORE_MONTH_END = datetime(2026, 10, 29, 12, 0, tzinfo=TIRANE)
MONTH_END = datetime(2026, 10, 30, 9, 0, tzinfo=TIRANE)
WEEKEND = datetime(2026, 10, 31, 12, 0, tzinfo=TIRANE)
AT_CUTOFF = datetime(2026, 11, 2, 0, 0, tzinfo=TIRANE)
OCTOBER = date(2026, 10, 1)


def at(moment):
    return mock.patch('django.utils.timezone.now', return_value=moment)


class AutoLifecycleTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        PayrollConfiguration.objects.update_or_create(
            pk=1, defaults={'require_tl_closed_before_finalize': True},
        )
        call_command('seed_payroll_rules', verbosity=0)
        cls.line_manager = User.objects.create_user('artur', password='x')
        cls.manager = User.objects.create_user('marco', password='x')
        cls.staffer = User.objects.create_user('staffer', password='x')
        profile = cls.staffer.profile
        profile.albanian_tl, profile.italian_tl = cls.line_manager, cls.manager
        profile.save(update_fields=['albanian_tl', 'italian_tl'])
        WageAssignment.objects.create(
            user=cls.staffer, gross_monthly_wage=Decimal('100000'),
            effective_from=date(2026, 1, 1), is_active=True,
        )

    def _october(self):
        return PayrollRun.objects.get(year=2026, month=10)

    def test_nothing_happens_before_the_last_working_day(self):
        payroll_lifecycle_tick(BEFORE_MONTH_END)
        self.assertFalse(PayrollRun.objects.exists())

    def test_draft_is_created_on_the_last_working_day_and_only_once(self):
        payroll_lifecycle_tick(MONTH_END)
        payroll_lifecycle_tick(WEEKEND)
        payroll_lifecycle_tick(MONTH_END)
        self.assertEqual(PayrollRun.objects.filter(year=2026, month=10).count(), 1)
        run = self._october()
        self.assertEqual(run.status, 'draft')
        self.assertIsNone(run.created_by)
        self.assertEqual(run.lines.count(), 1)

    def test_month_end_holiday_moves_the_draft_back_a_day(self):
        PublicHoliday.objects.create(name='H', date=date(2026, 10, 30), country_code='AL')
        payroll_lifecycle_tick(datetime(2026, 10, 28, 12, 0, tzinfo=TIRANE))
        self.assertFalse(PayrollRun.objects.exists())  # the 29th is the last working day now
        payroll_lifecycle_tick(BEFORE_MONTH_END)
        self.assertTrue(PayrollRun.objects.filter(month=10).exists())

    def test_a_cancelled_run_is_not_recreated(self):
        payroll_lifecycle_tick(MONTH_END)
        PayrollRun.objects.filter(month=10).update(status='cancelled')
        payroll_lifecycle_tick(WEEKEND)
        self.assertEqual(PayrollRun.objects.filter(month=10).count(), 1)
        self.assertEqual(self._october().status, 'cancelled')

    def test_no_retroactive_run_after_the_cutoff(self):
        payroll_lifecycle_tick(datetime(2026, 11, 10, 12, 0, tzinfo=TIRANE))
        self.assertFalse(PayrollRun.objects.exists())

    def test_unclosed_leader_gets_one_urgent_notice(self):
        payroll_lifecycle_tick(MONTH_END)
        payroll_lifecycle_tick(WEEKEND)
        notices = Notification.objects.filter(dedupe_key__startswith='tl-urgent-close:')
        self.assertEqual([n.user for n in notices], [self.line_manager])
        self.assertEqual(notices[0].notification_type, 'error')
        self.assertIn('Monday 02 November 2026', notices[0].message)
        self.assertIn('15 points', notices[0].message)
        self.assertEqual(self._october().status, 'draft')

    def test_everyone_closed_at_month_end_finalizes_early(self):
        payroll_lifecycle_tick(MONTH_END)
        with at(MONTH_END):
            finalize_period(self.line_manager, OCTOBER)
            self.assertEqual(advance_payroll_period(2026, 10), 'finalized')
        run = self._october()
        self.assertEqual(run.status, 'finalized')
        self.assertIsNone(run.finalized_by)

    def test_early_finalize_does_not_fire_before_the_last_working_day(self):
        with at(BEFORE_MONTH_END):
            finalize_period(self.line_manager, OCTOBER)
            self.assertEqual(advance_payroll_period(2026, 10), 'waiting')
        self.assertFalse(PayrollRun.objects.exists())

    def test_closing_before_month_end_finalizes_at_month_end(self):
        with at(BEFORE_MONTH_END):
            finalize_period(self.line_manager, OCTOBER)
        payroll_lifecycle_tick(MONTH_END)
        self.assertEqual(self._october().status, 'finalized')

    def test_close_signal_triggers_the_check_after_commit(self):
        payroll_lifecycle_tick(MONTH_END)
        signals.connect()
        self.addCleanup(signals.disconnect)
        with at(MONTH_END), self.captureOnCommitCallbacks(execute=True):
            finalize_period(self.line_manager, OCTOBER)
        self.assertEqual(self._october().status, 'finalized')

    def test_plugin_ready_and_disable_wire_the_close_hook(self):
        payroll_lifecycle_tick(MONTH_END)
        plugin = PayrollPlugin()
        plugin.ready()
        self.addCleanup(signals.disconnect)
        plugin.disable()
        with at(MONTH_END), self.captureOnCommitCallbacks(execute=True):
            finalize_period(self.line_manager, OCTOBER)
        self.assertEqual(self._october().status, 'draft')  # disabled: no reaction
        plugin.ready()
        ApprovalPeriodClose.objects.all().delete()
        with at(MONTH_END), self.captureOnCommitCallbacks(execute=True):
            finalize_period(self.line_manager, OCTOBER)
        self.assertEqual(self._october().status, 'finalized')

    def test_cutoff_closes_the_rest_and_finalizes(self):
        payroll_lifecycle_tick(MONTH_END)
        payroll_lifecycle_tick(AT_CUTOFF)
        run = self._october()
        self.assertEqual(run.status, 'finalized')
        self.assertIsNone(run.finalized_by)

    def test_cutoff_waits_for_the_next_working_day_when_day_two_is_a_weekend(self):
        # 2026-08-02 is a Sunday, so July's cutoff is Monday 08-03.
        payroll_lifecycle_tick(datetime(2026, 7, 31, 12, 0, tzinfo=TIRANE))
        payroll_lifecycle_tick(datetime(2026, 8, 2, 12, 0, tzinfo=TIRANE))
        self.assertEqual(PayrollRun.objects.get(month=7).status, 'draft')
        payroll_lifecycle_tick(datetime(2026, 8, 3, 0, 0, tzinfo=TIRANE))
        self.assertEqual(PayrollRun.objects.get(month=7).status, 'finalized')

    def test_hr_hears_about_the_automatic_finalize(self):
        hr = User.objects.create_user('hr1', password='x')
        hr.profile.is_hr_user = True
        hr.profile.save(update_fields=['is_hr_user'])
        payroll_lifecycle_tick(MONTH_END)
        payroll_lifecycle_tick(AT_CUTOFF)
        self.assertTrue(
            Notification.objects.filter(user=hr, dedupe_key__startswith='hr-payroll-auto-finalized:').exists()
        )

    def test_a_failing_finalize_is_logged_and_leaves_the_draft(self):
        payroll_lifecycle_tick(MONTH_END)
        with mock.patch(
            'plugins.payroll.services.payroll_service.finalize_run', side_effect=RuntimeError('boom'),
        ), self.assertLogs('plugins.payroll.services.payroll_service', level='ERROR'):
            payroll_lifecycle_tick(AT_CUTOFF)
        self.assertEqual(self._october().status, 'draft')
