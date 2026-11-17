"""M4: the year-start checklist names what is missing and stays read-only."""
from datetime import date
from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from apps.dashboard.models.calendar import PublicHoliday
from plugins.payroll.models import PayrollConfiguration, PayrollWorkCalendar, PayrollWorkday


class CheckYearStartTests(TestCase):
    def setUp(self):
        PayrollConfiguration.objects.update_or_create(pk=1, defaults={})
        call_command('seed_payroll_rules', verbosity=0)

    def _run(self):
        out = StringIO()
        try:
            call_command('check_year_start', '--year', '2027', stdout=out)
        except CommandError as exc:
            return out.getvalue(), exc
        return out.getvalue(), None

    def test_fails_and_says_what_is_missing_when_nothing_is_set_up(self):
        out, error = self._run()
        self.assertIsNotNone(error)
        self.assertIn('[FAIL] Public holidays', out)
        self.assertIn('[FAIL] Payroll work calendar', out)

    def test_passes_when_holidays_calendar_and_rules_are_in_place(self):
        config = PayrollConfiguration.get_singleton()
        PublicHoliday.objects.bulk_create([PublicHoliday(name='NY', date=date(2027, 1, 1))])
        cal = PayrollWorkCalendar.objects.create(country=config.country, year=2027, is_active=True)
        PayrollWorkday.objects.create(
            calendar=cal, date=date(2027, 1, 1), is_holiday=True, is_working_day=False,
            standard_hours=Decimal('0'),
        )
        out, error = self._run()
        self.assertIsNone(error, out)
        self.assertNotIn('[FAIL]', out)

    def test_a_holiday_the_calendar_does_not_mark_fails(self):
        config = PayrollConfiguration.get_singleton()
        PublicHoliday.objects.bulk_create([PublicHoliday(name='NY', date=date(2027, 1, 1))])
        PayrollWorkCalendar.objects.create(country=config.country, year=2027, is_active=True)
        out, error = self._run()
        self.assertIsNotNone(error)
        self.assertIn('2027-01-01', out)
