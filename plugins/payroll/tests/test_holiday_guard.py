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


class CalendarGenerationDoesNotInventHolidaysTests(TestCase):
    """A new year's calendar must come from the holidays HR entered, not from a built-in approximation."""

    @classmethod
    def setUpTestData(cls):
        PayrollConfiguration.objects.update_or_create(pk=1, defaults={})
        cls.admin = User.objects.create_superuser(username='cg_admin', email='a@t.com', password='x')

    def test_generating_a_year_with_no_holidays_is_refused_and_seeds_nothing(self):
        from plugins.payroll.services.calendar_service import generate_workdays_for_year
        calendar = PayrollWorkCalendar.objects.create(country='AL', year=2028, is_active=True)
        with self.assertRaises(ValidationError) as ctx:
            generate_workdays_for_year(calendar)
        self.assertIn('2028', ctx.exception.messages[0])
        self.assertEqual(PublicHoliday.objects.filter(date__year=2028).count(), 0)   # nothing was invented
        self.assertEqual(calendar.workdays.count(), 0)

    def test_the_generate_endpoint_answers_400_with_the_reason(self):
        from rest_framework.test import APIClient
        calendar = PayrollWorkCalendar.objects.create(country='AL', year=2028, is_active=True)
        api = APIClient()
        api.force_authenticate(user=self.admin)
        response = api.post(f'/api/plugins/payroll/work-calendar/{calendar.pk}/generate_year/', {}, format='json')
        self.assertEqual(response.status_code, 400, getattr(response, 'data', None))
        self.assertIn('holidays', str(response.data).lower())

    def test_generation_uses_the_holidays_hr_entered(self):
        from plugins.payroll.services.calendar_service import generate_workdays_for_year
        PublicHoliday.objects.bulk_create([PublicHoliday(name='Real', date=date(2028, 1, 3))])
        calendar = PayrollWorkCalendar.objects.create(country='AL', year=2028, is_active=True)
        generate_workdays_for_year(calendar)
        marked = set(calendar.workdays.filter(is_holiday=True).values_list('date', flat=True))
        self.assertEqual(marked, {date(2028, 1, 3)})

    def test_2026_keeps_its_reference_list(self):
        from plugins.payroll.services.calendar_service import seed_albania_2026
        calendar = seed_albania_2026()
        self.assertTrue(calendar.workdays.filter(is_holiday=True).exists())
