"""Simulation (audit 2026-11-16, M4/M9/M6): the year-rollover story across leave, payroll and notifications.

Employee books leave before a holiday exists -> HR is nagged -> the holiday arrives -> leave and balance
recount -> payroll refuses a draft until the calendar marks the holiday -> after it does, the draft works
and the nagging stops.
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from apps.dashboard.models.calendar import PublicHoliday
from apps.leave_management.models import LeaveBalance, LeaveRequest
from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role
from plugins.notifications.models import Notification
from plugins.payroll.models import (
    PayrollConfiguration, PayrollRun, PayrollRuleSet, PayrollWorkCalendar, PayrollWorkday, WageAssignment,
)
from plugins.payroll.services.payroll_service import generate_draft_run
from plugins.payroll.services.year_start import year_start_notice_tick

User = get_user_model()
HOLIDAY = date(2026, 12, 8)  # a Tuesday inside the booked week


class YearRolloverSimulation(TestCase):
    def setUp(self):
        PayrollConfiguration.objects.update_or_create(pk=1, defaults={'require_tl_closed_before_finalize': False})
        call_command('seed_payroll_rules', verbosity=0)
        Role.objects.get_or_create(code='hr', defaults={'name': 'hr'})
        self.hr = User.objects.create_user(username='sim_hr', password='x')
        assign_role(self.hr, 'hr')
        self.emp = User.objects.create_user(username='sim_emp', password='x')
        WageAssignment.objects.create(
            user=self.emp, gross_monthly_wage=Decimal('100000'), effective_from=date(2026, 1, 1), is_active=True,
        )
        self.balance = LeaveBalance.objects.create(
            user=self.emp, leave_type='vacation', year=2026, total_days=25, accrual_start_date=date(2000, 1, 1),
        )
        self.config = PayrollConfiguration.get_singleton()

    def _book_week(self):
        api = APIClient()
        api.force_authenticate(user=self.emp)
        response = api.post('/api/leave-management/requests/', {
            'start_date': '2026-12-07', 'end_date': '2026-12-11', 'request_type': 'vacation', 'reason': 't',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return LeaveRequest.objects.get(pk=response.data['id'])

    def _run(self):
        return PayrollRun.objects.create(
            year=2026, month=12, status='draft',
            rule_set=PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE'), created_by=self.hr,
        )

    def test_the_whole_story(self):
        leave = self._book_week()
        self.assertEqual(float(leave.days_counted), 5.0)

        # 1. From 1 November HR is told next year is not set up (once for the week).
        year_start_notice_tick(today=date(2026, 11, 2))
        year_start_notice_tick(today=date(2026, 11, 3))
        self.assertEqual(Notification.objects.filter(user=self.hr, dedupe_key__startswith='hr-year-start:').count(), 1)

        # 2. The holiday arrives late: leave and balance are recounted automatically.
        with self.captureOnCommitCallbacks(execute=True):
            holiday = PublicHoliday.objects.create(name='Late holiday', date=HOLIDAY)
        leave.refresh_from_db()
        self.balance.refresh_from_db()
        self.assertEqual(float(leave.days_counted), 4.0)
        self.assertEqual(float(self.balance.pending_days), 4.0)

        # 3. Payroll refuses to price December while the calendar does not mark the holiday.
        with self.assertRaises(ValidationError):
            generate_draft_run(self._run(), [self.emp])

        # 4. Once the calendar marks it, the draft is allowed.
        cal = PayrollWorkCalendar.objects.create(country=self.config.country, year=2026, is_active=True)
        PayrollWorkday.objects.create(
            calendar=cal, date=HOLIDAY, is_holiday=True, is_working_day=False, standard_hours=Decimal('0'),
            holiday_name=holiday.name,
        )
        self.assertEqual(len(generate_draft_run(PayrollRun.objects.get(month=12), [self.emp])), 1)

        # 5. Removing the holiday gives the day back and charges it again.
        with self.captureOnCommitCallbacks(execute=True):
            holiday.delete()
        leave.refresh_from_db()
        self.balance.refresh_from_db()
        self.assertEqual(float(leave.days_counted), 5.0)
        self.assertEqual(float(self.balance.pending_days), 5.0)
