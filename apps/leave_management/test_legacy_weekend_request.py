"""A request stored before the business-day rule must still be decidable (it 500'd on save)."""

from datetime import date

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIClient

from apps.leave_management.models import LeaveBalance, LeaveRequest

MONDAY = date(2026, 5, 25)
SUNDAY = date(2026, 5, 31)


class LegacyWeekendRequestTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='weekend_user', password='pw')
        self.staff = User.objects.create_user(username='weekend_staff', password='pw', is_staff=True)
        LeaveBalance.objects.create(
            user=self.user, leave_type='vacation', year=2026, total_days=22,
            accrual_start_date=date(2000, 1, 1),
        )
        self.request = LeaveRequest.objects.create(
            user=self.user, request_type='vacation', start_date=MONDAY, end_date=MONDAY
        )
        # Simulate a row written before validation existed.
        LeaveRequest.objects.filter(pk=self.request.pk).update(start_date=SUNDAY, end_date=SUNDAY)
        self.client.force_authenticate(self.staff)

    def test_staff_can_approve_a_legacy_weekend_request(self):
        response = self.client.post(f'/api/leave-management/requests/{self.request.id}/approve/')

        self.assertEqual(response.status_code, 200)
        self.request.refresh_from_db()
        self.assertEqual(self.request.status, 'approved')

    def test_staff_can_reject_a_legacy_weekend_request(self):
        response = self.client.post(
            f'/api/leave-management/requests/{self.request.id}/reject/',
            {'rejection_reason': 'weekend'}, format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.request.refresh_from_db()
        self.assertEqual(self.request.status, 'rejected')

    def test_changing_the_dates_to_a_weekend_is_still_rejected(self):
        request = LeaveRequest.objects.create(
            user=self.user, request_type='vacation', start_date=MONDAY, end_date=MONDAY
        )
        request.start_date = SUNDAY
        request.end_date = SUNDAY

        with self.assertRaises(ValidationError):
            request.save()
