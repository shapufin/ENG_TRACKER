"""SEC-08 / D2 proof tests: what ``?workspace_ids=`` lets a plain employee read.

Behavior pinned here (no code change was needed):
- a workspace the viewer cannot access (private, foreign team) exposes nothing,
  even when its id is passed explicitly;
- a *public* workspace exposes its members' rows by design (team-calendar
  transparency); that is the recorded D2 default, so this test documents it.
"""
from datetime import date
from uuid import uuid4

from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.dashboard.models.calendar import CalendarWorkspace
from apps.leave_management.models import LeaveRequest
from apps.overtime.models import Client, OvertimeLog
from apps.users.models import Team


class WorkspaceIdsVisibilityTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.viewer = User.objects.create_user(username='ws_viewer', password='x')
        cls.victim = User.objects.create_user(username='ws_victim', password='x')
        cls.client_obj = Client.objects.create(name='WS Client', code='WSC')
        cls.team = Team.objects.create(name='WS Victim Team', code='WSV')
        cls.victim.profile.teams.add(cls.team)
        cls.private_ws = CalendarWorkspace.objects.create(
            name='Private WS', code=f'ws-{uuid4().hex[:8]}', team=cls.team, is_public=False,
        )
        cls.public_ws = CalendarWorkspace.objects.create(
            name='Public WS', code=f'ws-{uuid4().hex[:8]}', team=cls.team, is_public=True,
        )
        today = date.today()
        cls.ot = OvertimeLog.objects.create(
            user=cls.victim, date=today, hours=2, description='victim ot',
            client=cls.client_obj, status='pending',
        )
        cls.leave = LeaveRequest.objects.create(
            user=cls.victim, request_type='vacation', start_date=today, end_date=today,
            reason='victim leave',
        )

    def setUp(self):
        self.client.force_authenticate(self.viewer)

    @staticmethod
    def _ids(resp):
        rows = resp.data['results'] if isinstance(resp.data, dict) else resp.data
        return {row['id'] for row in rows}

    def test_private_foreign_workspace_exposes_no_overtime(self):
        resp = self.client.get('/api/overtime/logs/', {'workspace_ids': str(self.private_ws.id)})
        self.assertEqual(resp.status_code, 200)
        self.assertNotIn(self.ot.id, self._ids(resp))

    def test_private_foreign_workspace_exposes_no_leave(self):
        resp = self.client.get(
            '/api/leave-management/requests/', {'workspace_ids': str(self.private_ws.id)}
        )
        self.assertEqual(resp.status_code, 200)
        self.assertNotIn(self.leave.id, self._ids(resp))

    def test_public_workspace_exposes_member_rows_by_design(self):
        resp = self.client.get('/api/overtime/logs/', {'workspace_ids': str(self.public_ws.id)})
        self.assertEqual(resp.status_code, 200)
        self.assertIn(self.ot.id, self._ids(resp))
