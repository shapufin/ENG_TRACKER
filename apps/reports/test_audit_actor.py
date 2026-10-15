"""PERF-10: the audit actor must be the JWT user, and JWT requests must not pay for a session lookup."""
from datetime import date

from django.contrib.auth.models import User
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.overtime.models import Client
from apps.reports.models import AuditLog


class AuditActorTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='aa-user', password='x')
        self.client_obj = Client.objects.create(name='AA Client', code='AAC')
        self.api = APIClient()
        self.api.credentials(HTTP_AUTHORIZATION=f'Bearer {AccessToken.for_user(self.user)}')

    def _create_ot(self):
        return self.api.post(
            '/api/overtime/logs/',
            {'date': date.today().isoformat(), 'hours': 2, 'description': 'x', 'client': self.client_obj.id},
            format='json',
        )

    def test_jwt_write_records_the_acting_user(self):
        resp = self._create_ot()
        self.assertEqual(resp.status_code, 201, resp.data)
        entry = AuditLog.objects.get(model_name='overtimelog', object_id=str(resp.data['id']), action='CREATE')
        self.assertEqual(entry.user_id, self.user.id)

    def test_actor_does_not_leak_into_the_next_request(self):
        self._create_ot()
        anonymous = APIClient()
        self.assertEqual(anonymous.get('/api/overtime/logs/').status_code, 401)
        from core.middleware.user_context import get_current_user
        self.assertIsNone(get_current_user())

    def test_jwt_request_does_not_touch_the_session_table(self):
        self.api.cookies['sessionid'] = 'stale-session-key'
        with CaptureQueriesContext(connection) as ctx:
            resp = self.api.get('/api/overtime/logs/')
        self.assertEqual(resp.status_code, 200)
        session_queries = [q['sql'] for q in ctx.captured_queries if 'django_session' in q['sql']]
        self.assertEqual(session_queries, [])
