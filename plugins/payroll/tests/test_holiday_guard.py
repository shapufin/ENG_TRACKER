"""M4 (audit 2026-11-16): a draft must not silently price a public holiday as a normal day."""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import TestCase

from apps.dashboard.models.calendar import PublicHoliday
from plugins.payroll.models import (
    PayrollConfiguration,
    PayrollRun,
    PayrollRuleSet,
    PayrollWorkCalendar,
    PayrollWorkday,
    WageAssignment,
)
from plugins.payroll.services.payroll_service import generate_draft_run

User = get_user_model()


class HolidayCalendarGuardTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        PayrollConfiguration.objects.update_or_create(pk=1, defaults={'require_tl_closed_before_finalize': False})
        call_command('seed_payroll_rules', verbosity=0)
        cls.admin = User.objects.create_superuser(username='hg_admin', email='a@t.com', password='x')
        cls.employee = User.objects.create_user(username='hg_emp', email='e@t.com', password='x')
        WageAssignment.objects.create(
            user=cls.employee, gross_monthly_wage=Decimal('100000'),
            effective_from=date(2026, 1, 1), is_active=True,
        )

    def _run(self, year, month):
        return PayrollRun.objects.create(
            year=year, month=month, status='draft',
            rule_set=PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE'), created_by=self.admin,
        )

    def test_a_holiday_in_the_month_with_no_calendar_for_the_year_refuses_the_draft(self):
        PublicHoliday.objects.create(name='New Year', date=date(2027, 1, 1))
        with self.assertRaises(ValidationError) as ctx:
            generate_draft_run(self._run(2027, 1), [self.employee])
        self.assertIn('calendar', ctx.exception.messages[0].lower())

    def test_a_holiday_missing_from_the_calendar_refuses_the_draft(self):
        calendar = PayrollWorkCalendar.objects.create(country='AL', year=2027, is_active=True)
        PayrollWorkday.objects.create(
            calendar=calendar, date=date(2027, 1, 4), is_working_day=True, standard_hours=Decimal('8'),
        )
        PublicHoliday.objects.bulk_create([PublicHoliday(name='Late', date=date(2027, 1, 4))])  # not mirrored
        with self.assertRaises(ValidationError):
            generate_draft_run(self._run(2027, 1), [self.employee])

    def test_no_holidays_in_the_month_keeps_the_weekday_fallback(self):
        lines = generate_draft_run(self._run(2027, 2), [self.employee])
        self.assertEqual(len(lines), 1)

    def test_a_calendar_that_marks_the_holiday_allows_the_draft(self):
        calendar = PayrollWorkCalendar.objects.create(country='AL', year=2027, is_active=True)
        PayrollWorkday.objects.create(
            calendar=calendar, date=date(2027, 1, 1), is_holiday=True, is_working_day=False,
            standard_hours=Decimal('0'), holiday_name='New Year',
        )
        PublicHoliday.objects.bulk_create([PublicHoliday(name='New Year', date=date(2027, 1, 1))])
        self.assertEqual(len(generate_draft_run(self._run(2027, 1), [self.employee])), 1)
