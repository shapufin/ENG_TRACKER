"""M4 (audit 2026-11-16): from 1 November HR and administrators hear, once a week, what next year still lacks."""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from apps.dashboard.models.calendar import PublicHoliday
from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role
from plugins.notifications.models import Notification
from plugins.payroll.models import PayrollConfiguration, PayrollWorkCalendar, PayrollWorkday
from plugins.payroll.services.year_start import year_start_notice_tick

User = get_user_model()


class YearStartNoticeTests(TestCase):
    def setUp(self):
        PayrollConfiguration.objects.update_or_create(pk=1, defaults={})
        call_command('seed_payroll_rules', verbosity=0)
        Role.objects.get_or_create(code='hr', defaults={'name': 'hr'})
        self.hr = User.objects.create_user(username='ys_hr', password='x')
        assign_role(self.hr, 'hr')
        self.admin = User.objects.create_user(username='ys_admin', password='x', is_staff=True)
        self.plain = User.objects.create_user(username='ys_plain', password='x')

    def _notices(self):
        return Notification.objects.filter(title__contains='2027')

    def test_from_november_hr_and_admins_are_told_what_is_missing(self):
        year_start_notice_tick(today=date(2026, 11, 2))
        self.assertEqual(set(self._notices().values_list('user__username', flat=True)), {'ys_hr', 'ys_admin'})
        text = self._notices().first().message
        self.assertIn('holidays', text.lower())
        self.assertIn('calendar', text.lower())

    def test_nothing_before_november(self):
        year_start_notice_tick(today=date(2026, 10, 31))
        self.assertEqual(self._notices().count(), 0)

    def test_once_a_week_not_every_hour(self):
        year_start_notice_tick(today=date(2026, 11, 2))
        year_start_notice_tick(today=date(2026, 11, 4))  # same ISO week
        self.assertEqual(self._notices().filter(user=self.hr).count(), 1)
        year_start_notice_tick(today=date(2026, 11, 9))  # next week: a reminder
        self.assertEqual(self._notices().filter(user=self.hr).count(), 2)

    def test_silent_when_next_year_is_ready(self):
        config = PayrollConfiguration.get_singleton()
        PublicHoliday.objects.bulk_create([PublicHoliday(name='NY', date=date(2027, 1, 1))])
        cal = PayrollWorkCalendar.objects.create(country=config.country, year=2027, is_active=True)
        PayrollWorkday.objects.create(
            calendar=cal, date=date(2027, 1, 1), is_holiday=True, is_working_day=False, standard_hours=Decimal('0'),
        )
        year_start_notice_tick(today=date(2026, 11, 2))
        self.assertEqual(self._notices().count(), 0)

    def test_the_job_is_declared_daily_on_the_plugin(self):
        from plugins.payroll.plugin import PayrollPlugin
        jobs = {name: interval for name, interval, _ in PayrollPlugin().get_scheduled_jobs()}
        self.assertEqual(jobs['year_start'], 86400)
