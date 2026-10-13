"""Holiday-aware vacation day counting and the counted-days snapshot (plan v2, Task 1)."""

from datetime import date
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from apps.dashboard.models.calendar import CalendarWorkspace, PublicHoliday
from apps.leave_management.models import LeaveBalance, LeaveRequest, count_leave_days

WEEK_START = date(2026, 3, 9)  # Monday
WEEK_END = date(2026, 3, 13)  # Friday
HOLIDAY = date(2026, 3, 11)  # Wednesday inside the week


class LeaveHolidayCountTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='holi_user', password='pw')
        self.staff = User.objects.create_user(username='holi_staff', password='pw', is_staff=True)
        self.balance = LeaveBalance.objects.create(
            user=self.user,
            leave_type='vacation',
            year=2026,
            total_days=22,
            accrual_start_date=date(2000, 1, 1),
        )

    def test_global_holiday_is_not_counted(self):
        PublicHoliday.objects.create(name='Global day', date=HOLIDAY, is_global=True)
        self.assertEqual(count_leave_days(WEEK_START, WEEK_END), 4)

    def test_workspace_holiday_does_not_reduce_vacation(self):
        calendar = CalendarWorkspace.objects.create(name='Team WS', code='team-ws', is_public=False)
        PublicHoliday.objects.create(name='Team day', date=HOLIDAY, is_global=False, calendar=calendar)
        self.assertEqual(count_leave_days(WEEK_START, WEEK_END), 5)

    def test_inverted_or_empty_range_counts_zero(self):
        self.assertEqual(count_leave_days(WEEK_END, WEEK_START), 0)
        self.assertEqual(count_leave_days(None, WEEK_END), 0)

    def test_new_request_snapshots_days_counted(self):
        request = LeaveRequest.objects.create(
            user=self.user, request_type='vacation', start_date=WEEK_START, end_date=WEEK_END
        )
        self.assertEqual(request.days_counted, Decimal('5'))

    def test_snapshot_ignores_holiday_added_later(self):
        request = LeaveRequest.objects.create(
            user=self.user, request_type='vacation', start_date=WEEK_START, end_date=WEEK_END
        )
        PublicHoliday.objects.create(name='Added later', date=HOLIDAY, is_global=True)
        request.refresh_from_db()
        self.assertEqual(request.days_requested, Decimal('5'))
        self.assertEqual(request.days_counted, Decimal('5'))

    def test_cancel_after_holiday_added_restores_exact_amount(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            '/api/leave-management/requests/',
            {'request_type': 'vacation', 'start_date': str(WEEK_START), 'end_date': str(WEEK_END)},
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.content)
        request_id = response.data['id']

        self.client.force_authenticate(user=self.staff)
        self.client.post(f'/api/leave-management/requests/{request_id}/approve/', format='json')
        self.balance.refresh_from_db()
        self.assertEqual(self.balance.used_days, Decimal('5'))

        PublicHoliday.objects.create(name='Added after approval', date=HOLIDAY, is_global=True)
        self.client.post(
            f'/api/leave-management/requests/{request_id}/reject/',
            {'rejection_reason': 'changed mind'},
            format='json',
        )
        self.balance.refresh_from_db()
        self.assertEqual(self.balance.used_days, Decimal('0'))
        self.assertEqual(self.balance.pending_days, Decimal('0'))

    def test_backfill_snapshots_weekday_count_not_later_holiday_count(self):
        from io import StringIO
        from django.core.management import call_command

        request = LeaveRequest.objects.create(
            user=self.user, request_type='vacation', start_date=WEEK_START, end_date=WEEK_END
        )
        LeaveRequest.objects.filter(pk=request.pk).update(days_counted=None)
        PublicHoliday.objects.create(name='Added later', date=HOLIDAY, is_global=True)
        call_command('backfill_leave_days_counted', stdout=StringIO())
        request.refresh_from_db()
        # Those balances were moved with the weekday count (no holidays then).
        self.assertEqual(request.days_counted, Decimal('5'))

    def test_pending_backlog_moves_by_exactly_the_counted_days(self):
        from apps.dashboard.admin_overview import pending_backlog

        PublicHoliday.objects.create(name='Global WED', date=HOLIDAY, is_global=True)
        before = pending_backlog()['leave']['days']
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            '/api/leave-management/requests/',
            {'request_type': 'vacation', 'start_date': str(WEEK_START), 'end_date': str(WEEK_END)},
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(pending_backlog()['leave']['days'] - before, 4)

    def test_request_made_only_of_global_holidays_is_rejected(self):
        PublicHoliday.objects.create(name='Only day', date=HOLIDAY, is_global=True)
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            '/api/leave-management/requests/',
            {'request_type': 'vacation', 'start_date': str(HOLIDAY), 'end_date': str(HOLIDAY)},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
