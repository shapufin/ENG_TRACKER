"""Internal data scope is link-only (owner ruling 2026-11-10).

A Line Manager / Manager sees an employee's internal data (approvals, leave, overtime, standby)
only through the employee's ``albanian_tl`` / ``italian_tl`` link. Shared team membership and
``Team.team_leader`` are calendar concepts: they must not widen data scope, and the calendar
workspace access they give must stay exactly as it was.
"""
from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.dashboard.models.calendar import CalendarWorkspace
from apps.overtime.models import Client, OvertimeLog
from apps.users.models import Team


class LinkOnlyScopeTests(APITestCase):
    def setUp(self):
        self.x = User.objects.create_user(username='x_lm', password='x')
        self.x.profile.is_albanian_tl_role = True
        self.x.profile.save()
        self.a = User.objects.create_user(username='a_emp', password='x')
        self.team = Team.objects.create(name='T', code='T1')
        self.cl = Client.objects.create(name='C', code='C1')
        OvertimeLog.objects.create(
            user=self.a, date='2026-11-03', hours=2, description='d', client=self.cl, status='pending'
        )

    def _scope(self):
        return self.x.profile.get_team_member_ids()

    def _team_logs_users(self):
        self.client.force_authenticate(self.x)
        resp = self.client.get('/api/overtime/logs/team_logs/')
        self.assertEqual(resp.status_code, 200)
        rows = resp.data['results'] if isinstance(resp.data, dict) and 'results' in resp.data else resp.data
        return {row['user'] if not isinstance(row['user'], dict) else row['user']['id'] for row in rows}

    def test_direct_link_grants_scope(self):
        self.a.profile.albanian_tl = self.x
        self.a.profile.save()
        self.assertIn(self.a.id, self._scope())
        self.assertIn(self.a.id, self._team_logs_users())

    def test_manager_link_grants_scope(self):
        self.a.profile.italian_tl = self.x
        self.a.profile.save()
        self.assertIn(self.a.id, self._scope())

    def test_shared_team_membership_grants_nothing(self):
        self.x.profile.teams.add(self.team)
        self.a.profile.teams.add(self.team)
        self.assertNotIn(self.a.id, self._scope())
        self.assertNotIn(self.a.id, self._team_logs_users())

    def test_team_leader_field_grants_no_data_scope(self):
        self.team.team_leader = self.x
        self.team.save()
        self.a.profile.teams.add(self.team)
        self.assertNotIn(self.a.id, self._scope())
        self.assertNotIn(self.a.id, self._team_logs_users())

    def test_team_leader_field_still_makes_a_team_leader(self):
        lead = User.objects.create_user(username='lead_only', password='x')
        self.team.team_leader = lead
        self.team.save()
        self.assertTrue(lead.profile.is_team_leader)

    def test_audit_command_lists_team_only_reach_and_writes_nothing(self):
        from io import StringIO

        from django.core.management import call_command

        self.x.profile.teams.add(self.team)
        self.a.profile.teams.add(self.team)
        out = StringIO()
        call_command('audit_team_only_scope', stdout=out)
        self.assertIn('x_lm: 1 reachable only via team -> a_emp', out.getvalue())
        self.assertIn('1 leader(s), 1 person(s)', out.getvalue())
        self.a.profile.refresh_from_db()
        self.assertIsNone(self.a.profile.albanian_tl_id)

    def test_audit_command_is_quiet_when_links_exist(self):
        from io import StringIO

        from django.core.management import call_command

        self.x.profile.teams.add(self.team)
        self.a.profile.teams.add(self.team)
        self.a.profile.albanian_tl = self.x
        self.a.profile.save()
        out = StringIO()
        call_command('audit_team_only_scope', stdout=out)
        self.assertIn('0 leader(s), 0 person(s)', out.getvalue())

    def test_calendar_workspace_access_is_unchanged(self):
        """A team's leader and a plain TL-member still reach the team workspace."""
        lead = User.objects.create_user(username='lead_cal', password='x')
        self.team.team_leader = lead
        self.team.save()
        self.a.profile.teams.add(self.team)
        ws = CalendarWorkspace.objects.create(name='WS', code='ws-t1', team=self.team, is_public=False)
        self.assertIn(ws.id, set(CalendarWorkspace.get_accessible_for_user(lead).values_list('id', flat=True)))
        self.assertIn(ws.id, set(CalendarWorkspace.get_accessible_for_user(self.a).values_list('id', flat=True)))
