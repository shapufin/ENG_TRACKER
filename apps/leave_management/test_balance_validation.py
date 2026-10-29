"""Admin balance edits must never store negative day counts."""
from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.leave_management.models import LeaveBalance


class BalanceNonNegativeTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser(username='lbv_admin', password='x')
        cls.employee = User.objects.create_user(username='lbv_emp', password='x')
        cls.balance = LeaveBalance.objects.create(
            user=cls.employee, leave_type='vacation', year=2026, total_days=20
        )

    def test_negative_days_are_rejected(self):
        self.client.force_authenticate(self.admin)
        for field in ('total_days', 'used_days', 'pending_days'):
            response = self.client.patch(
                f'/api/leave-management/balances/{self.balance.id}/', {field: '-1.0'}, format='json'
            )
            self.assertEqual(response.status_code, 400, (field, response.data))
            self.assertIn(field, response.data)

    def test_lowering_total_below_used_is_still_allowed(self):
        """HR corrects an entitlement after days were taken; that is a negative remainder, not bad input."""
        self.client.force_authenticate(self.admin)
        LeaveBalance.objects.filter(pk=self.balance.pk).update(used_days=10)
        response = self.client.patch(
            f'/api/leave-management/balances/{self.balance.id}/', {'total_days': '5.0'}, format='json'
        )
        self.assertEqual(response.status_code, 200, response.data)
