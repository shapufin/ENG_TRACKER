"""Admin pickers (HBPR assignments, leave requests) load every user in one request."""
from django.contrib.auth.models import User
from rest_framework.test import APITestCase


class UserListPageSizeTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser(username='ulps_admin', password='x')
        for i in range(60):
            User.objects.create_user(username=f'ulps_{i}', password='x')

    def test_page_size_param_returns_every_user(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get('/api/users/users/', {'page_size': 500})
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(response.data['count'], 61)
        self.assertEqual(len(response.data['results']), response.data['count'])
