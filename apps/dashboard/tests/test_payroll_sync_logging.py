"""A failing HR->Payroll holiday mirror must be logged, never swallowed silently."""

from datetime import date
from unittest import mock

from django.test import TestCase

from apps.dashboard.models.calendar import PublicHoliday
from apps.dashboard import signals
from apps.plugins.models import Plugin


class PayrollHolidaySyncLoggingTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        Plugin.objects.update_or_create(
            name='payroll',
            defaults={'verbose_name': 'Payroll', 'version': '1', 'is_enabled': True},
        )

    def _holiday(self):
        return PublicHoliday(name='Test Day', date=date(2026, 5, 1), calendar=None)

    def test_mirror_failure_is_logged(self):
        with mock.patch('plugins.payroll.models.PayrollWorkCalendar.objects') as cals, \
                mock.patch('plugins.payroll.models.PayrollWorkday.objects') as days:
            cals.filter.return_value = [mock.Mock()]
            days.update_or_create.side_effect = RuntimeError('boom')
            with self.assertLogs('apps.dashboard.signals', level='WARNING'):
                signals.sync_public_holiday_to_payroll(PublicHoliday, self._holiday())

    def test_restore_failure_is_logged(self):
        with mock.patch('plugins.payroll.models.PayrollWorkCalendar.objects') as cals:
            cals.filter.side_effect = RuntimeError('boom')
            with self.assertLogs('apps.dashboard.signals', level='WARNING'):
                signals._restore_payroll_workday(date(2026, 5, 1))
