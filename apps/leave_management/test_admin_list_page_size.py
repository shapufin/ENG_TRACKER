"""Admin roster lists must honour ?page_size= so the admin pages see every row."""
from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.leave_management.models import LeaveBalance


class BalanceListPageSizeTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser(username='lbps_admin', password='x')
        for i in range(60):
            user = User.objects.create_user(username=f'lbps_{i}', password='x')
            LeaveBalance.objects.create(user=user, leave_type='vacation', year=2026, total_days=20)

    def test_page_size_param_returns_every_balance(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get('/api/leave-management/balances/', {'page_size': 1000})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 60)
        self.assertEqual(len(response.data['results']), 60)
