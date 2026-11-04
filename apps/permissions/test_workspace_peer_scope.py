"""Handover SEC-03: ``?workspace_ids=`` must not widen an employee's scope to peers' compensation data.

Ruling 2026-10-20 (team confidentiality): an employee reads self only, except the
team vacation/standby calendar. Overtime and audit logs are never calendar data.
"""
from datetime import date
from uuid import uuid4

from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.dashboard.models.calendar import CalendarWorkspace
from apps.overtime.models import Client, OvertimeLog
from apps.reports.models import AuditLog
from apps.standby.models import StandbyLog
from apps.users.models import Team


def _ids(resp):
    rows = resp.data['results'] if isinstance(resp.data, dict) else resp.data
    return {row['id'] for row in rows}


class WorkspaceIdsPeerScopeTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.viewer = User.objects.create_user(username='peer_viewer', password='x')
        cls.peer = User.objects.create_user(username='peer_other', password='x')
        cls.team = Team.objects.create(name='Peer Team', code='PRT')
        cls.viewer.profile.teams.add(cls.team)
        cls.peer.profile.teams.add(cls.team)
        cls.ws = CalendarWorkspace.objects.create(
            name='Peer WS', code=f'ws-{uuid4().hex[:8]}', team=cls.team, is_public=True,
        )
        cls.client_obj = Client.objects.create(name='Peer Client', code='PRC')
        today = date.today()
        cls.ot_peer = OvertimeLog.objects.create(
            user=cls.peer, date=today, hours=2, description='peer ot',
            client=cls.client_obj, status='pending',
        )
        cls.ot_own = OvertimeLog.objects.create(
            user=cls.viewer, date=today, hours=1, description='own ot',
            client=cls.client_obj, status='pending',
        )
        cls.sb_peer = StandbyLog.objects.create(user=cls.peer, date=today, hours=4, status='pending')
        cls.audit_peer = AuditLog.objects.create(
            user=cls.peer, action='CREATE', model_name='overtimelog', object_id='1',
        )
        cls.audit_own = AuditLog.objects.create(
            user=cls.viewer, action='CREATE', model_name='overtimelog', object_id='2',
        )

    def setUp(self):
        self.client.force_authenticate(self.viewer)

    def test_overtime_with_workspace_ids_stays_self_only(self):
        resp = self.client.get('/api/overtime/logs/', {'workspace_ids': str(self.ws.id)})
        self.assertEqual(resp.status_code, 200)
        ids = _ids(resp)
        self.assertNotIn(self.ot_peer.id, ids)
        self.assertIn(self.ot_own.id, ids)

    def test_overtime_calendar_flag_does_not_reopen_peers(self):
        resp = self.client.get(
            '/api/overtime/logs/', {'workspace_ids': str(self.ws.id), 'calendar': 'true'}
        )
        self.assertNotIn(self.ot_peer.id, _ids(resp))

    def test_standby_with_workspace_ids_alone_stays_self_only(self):
        resp = self.client.get('/api/standby/logs/', {'workspace_ids': str(self.ws.id)})
        self.assertEqual(resp.status_code, 200)
        self.assertNotIn(self.sb_peer.id, _ids(resp))

    def test_standby_team_calendar_still_shows_peers(self):
        resp = self.client.get(
            '/api/standby/logs/',
            {'workspace_ids': str(self.ws.id), 'calendar': 'true', 'page_size': 100},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn(self.sb_peer.id, _ids(resp))

    def test_audit_logs_with_workspace_ids_stay_self_only(self):
        resp = self.client.get('/api/reports/audit-logs/', {'workspace_ids': str(self.ws.id)})
        self.assertEqual(resp.status_code, 200)
        ids = _ids(resp)
        self.assertNotIn(self.audit_peer.id, ids)
        self.assertIn(self.audit_own.id, ids)
