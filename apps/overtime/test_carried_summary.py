from datetime import date
from decimal import Decimal
from uuid import uuid4

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from apps.overtime.models import Client, OvertimeLog
from apps.users.services.approval_periods import next_period
from core.utils.timezone_local import business_today


class SummaryCarriedHoursTests(TestCase):
    """The summary card shows this month's hours plus a separate carried-in figure."""

    def setUp(self):
        self.month = business_today().replace(day=1)
        self.prev = date(self.month.year - 1, 12, 1) if self.month.month == 1 else self.month.replace(month=self.month.month - 1)
        self.client_obj = Client.objects.create(name=f'C{uuid4().hex[:8]}', code=f'C{uuid4().hex[:8]}')
        self.emp = User.objects.create_user(username=f'emp{uuid4().hex[:6]}', password='x')
        self.other = User.objects.create_user(username=f'oth{uuid4().hex[:6]}', password='x')
        self.api = APIClient()
        self.api.force_authenticate(self.emp)

    def _entry(self, user, work_date, hours, requested, status='approved'):
        return OvertimeLog.objects.create(
            user=user, client=self.client_obj, date=work_date, hours=Decimal(hours),
            status=status, requested_processing_period=requested,
        )

    def _summary(self):
        response = self.api.get('/api/overtime/logs/summary/')
        self.assertEqual(response.status_code, 200)
        return response.data

    def test_carried_hours_counts_only_own_entries_processed_this_month(self):
        self._entry(self.emp, self.month, '11', self.month)
        self._entry(self.emp, self.prev.replace(day=28), '3', self.month)  # carried in
        self._entry(self.emp, self.prev.replace(day=27), '2', self.month, status='pending')  # carried in
        self._entry(self.emp, self.prev.replace(day=26), '9', self.month, status='rejected')  # excluded
        self._entry(self.emp, self.prev.replace(day=25), '4', self.prev)  # settled last month
        self._entry(self.other, self.prev.replace(day=24), '7', self.month)  # someone else's
        data = self._summary()
        self.assertEqual(float(data['carried_hours']), 5.0)
        # The card total stays "dated this month": the carried hours are an addition, not a re-sum.
        self.assertEqual(float(data['total_hours']), 11.0)

    def test_carried_hours_is_zero_without_carried_entries(self):
        self._entry(self.emp, self.month, '4', self.month)
        self.assertEqual(float(self._summary()['carried_hours']), 0.0)

    def test_carry_next_month_is_not_counted_now(self):
        # An entry processed next month is not carried INTO this month.
        self._entry(self.emp, self.month, '6', next_period(self.month))
        self.assertEqual(float(self._summary()['carried_hours']), 0.0)
