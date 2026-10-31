"""Calendar sidebar facets: workspace_users says which active clients and techs each person works on."""
from django.contrib.auth.models import User
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.dashboard.models.calendar import CalendarWorkspace
from apps.overtime.models import Client
from apps.users.models import Team, TeamMembership, Tech


class WorkspaceUserFacetTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.team = Team.objects.create(name='Alpha', code='ALP')
        self.workspace = CalendarWorkspace.objects.get(team=self.team)
        self.ana = User.objects.create_user('ana', password='x')
        self.bob = User.objects.create_user('bob', password='x')
        for user in (self.ana, self.bob):
            TeamMembership.objects.create(user_profile=user.profile, team=self.team)
        self.acme = Client.objects.create(name='Acme', code='ACM')
        self.old = Client.objects.create(name='Old', code='OLD', is_active=False)
        self.db = Tech.objects.create(name='Database', code='DB')
        self.ana.profile.clients.add(self.acme, self.old)
        self.ana.profile.techs.add(self.db)
        self.api.force_authenticate(self.ana)

    def _rows(self):
        resp = self.api.get(f'/api/dashboard/calendar-workspaces/{self.workspace.id}/workspace_users/')
        self.assertEqual(resp.status_code, 200)
        return {row['username']: row for row in resp.data}

    def test_each_person_lists_their_active_clients_and_techs(self):
        ana = self._rows()['ana']
        self.assertEqual([c['code'] for c in ana['clients_detail']], ['ACM'])
        self.assertEqual([t['code'] for t in ana['techs_detail']], ['DB'])

    def test_person_with_nothing_assigned_gets_empty_lists(self):
        bob = self._rows()['bob']
        self.assertEqual(bob['clients_detail'], [])
        self.assertEqual(bob['techs_detail'], [])

    def test_facets_cost_the_same_queries_for_more_people(self):
        url = f'/api/dashboard/calendar-workspaces/{self.workspace.id}/workspace_users/'

        def count():
            with CaptureQueriesContext(connection) as ctx:
                self.api.get(url)
            return len(ctx.captured_queries)

        before = count()
        for i in range(5):
            user = User.objects.create_user(f'u{i}', password='x')
            TeamMembership.objects.create(user_profile=user.profile, team=self.team)
            user.profile.clients.add(self.acme)
            user.profile.techs.add(self.db)
        self.assertEqual(count(), before)
