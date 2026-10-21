"""The admin Teams page loads the whole directory in one request."""
from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.users.models import Team


class TeamListPageSizeTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser(username='tlps_admin', password='x')
        for i in range(60):
            Team.objects.create(name=f'TLPS {i}', code=f'TP{i}')

    def test_page_size_param_returns_every_team(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get('/api/users/teams/', {'page_size': 1000})
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(response.data['count'], 60)
        self.assertEqual(len(response.data['results']), response.data['count'])
