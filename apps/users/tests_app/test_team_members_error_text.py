"""A database error never reaches the client as text (audit 2026-11-17 L6)."""
from unittest.mock import patch

from django.contrib.auth.models import User
from django.db import DatabaseError
from django.test import TestCase
from rest_framework.test import APIClient

URL = '/api/users/users/my_team_members/'


class TeamMembersErrorTextTests(TestCase):
    def test_a_database_error_is_logged_not_returned(self):
        api = APIClient()
        from apps.permissions.services.role_service import assign_role

        lead = User.objects.create_user('te_lead', password='x')
        assign_role(lead, 'albanian_tl')
        api.force_authenticate(lead)
        with patch('apps.users.models.UserProfile.get_team_member_ids',
                   side_effect=DatabaseError('relation "secret_table" does not exist')):
            with self.assertLogs('apps.users.viewsets', level='ERROR'):
                response = api.get(URL)
        self.assertEqual(response.status_code, 500)
        self.assertNotIn('secret_table', response.content.decode())
