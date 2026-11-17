"""H3 (audit 2026-11-16): approving a request again must pass the same overlap and balance rules as creating it."""
from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.leave_management.models import LeaveBalance, LeaveRequest

User = get_user_model()
WEEK = {'start_date': '2026-12-07', 'end_date': '2026-12-11', 'request_type': 'vacation', 'reason': 't'}


class ReapprovalGuardTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.emp = User.objects.create_user(username='ra_emp', password='x')
        self.tl = User.objects.create_user(username='ra_tl', password='x', is_staff=True)
        self.balance = LeaveBalance.objects.create(
            user=self.emp, leave_type='vacation', year=2026, total_days=25,
            accrual_start_date=date(2000, 1, 1),
        )

    def _create(self, **over):
        self.api.force_authenticate(user=self.emp)
        response = self.api.post('/api/leave-management/requests/', {**WEEK, **over}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        return response.data['id']

    def _act(self, leave_id, verb, **data):
        self.api.force_authenticate(user=self.tl)
        return self.api.post(f'/api/leave-management/requests/{leave_id}/{verb}/', data, format='json')

    def _used(self):
        self.balance.refresh_from_db()
        return float(self.balance.used_days)

    def test_a_rejected_request_cannot_be_approved_over_an_approved_one_for_the_same_dates(self):
        first = self._create()
        self.assertEqual(self._act(first, 'reject', rejection_reason='x').status_code, 200)
        second = self._create()
        self.assertEqual(self._act(second, 'approve').status_code, 200)

        response = self._act(first, 'approve')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertEqual(LeaveRequest.objects.get(pk=first).status, 'rejected')
        self.assertEqual(self._used(), 5.0)

    def test_a_rejected_request_cannot_be_approved_without_enough_balance(self):
        leave = self._create()
        self._act(leave, 'reject', rejection_reason='x')
        self.balance.used_days = 23  # 2 left, request needs 5
        self.balance.save(update_fields=['used_days'])

        response = self._act(leave, 'approve')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertEqual(self._used(), 23.0)

    def test_a_rejected_request_with_free_dates_and_balance_can_still_be_approved(self):
        leave = self._create()
        self._act(leave, 'reject', rejection_reason='x')

        self.assertEqual(self._act(leave, 'approve').status_code, 200)
        self.assertEqual(self._used(), 5.0)

    def test_approving_an_approved_request_changes_nothing(self):
        leave = self._create()
        self._act(leave, 'approve')
        first = LeaveRequest.objects.get(pk=leave)
        other_tl = User.objects.create_user(username='ra_tl2', password='x', is_staff=True)

        self.api.force_authenticate(user=other_tl)
        response = self.api.post(f'/api/leave-management/requests/{leave}/approve/', {}, format='json')

        self.assertEqual(response.status_code, 200, response.data)
        after = LeaveRequest.objects.get(pk=leave)
        self.assertEqual(after.approved_by_id, self.tl.pk)
        self.assertEqual(after.approved_at, first.approved_at)
        self.assertEqual(self._used(), 5.0)
