"""Teams expose the Italian/Albanian TL their members share (display-only)."""
from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.users.models import Team


class TeamDerivedTlTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(username='dt_admin', password='x', is_staff=True)
        cls.it_a = User.objects.create_user(username='it_a', password='x')
        cls.it_b = User.objects.create_user(username='it_b', password='x')
        cls.al_a = User.objects.create_user(username='al_a', password='x')
        cls.team = Team.objects.create(name='Derived', code='DRV')
        cls.mixed = Team.objects.create(name='Mixed', code='MIX')
        cls.empty = Team.objects.create(name='Empty', code='EMP')

    def _member(self, name, team, it=None, al=None, active=True):
        user = User.objects.create_user(username=name, password='x', is_active=active)
        profile = user.profile
        profile.italian_tl, profile.albanian_tl = it, al
        profile.save()
        profile.teams.add(team)
        return user

    def _row(self, team):
        self.client.force_authenticate(self.admin)
        resp = self.client.get('/api/users/teams/')
        self.assertEqual(resp.status_code, 200)
        rows = resp.data['results'] if isinstance(resp.data, dict) else resp.data
        return next(r for r in rows if r['id'] == team.id)

    def test_shared_tls_are_derived(self):
        self._member('dt_m1', self.team, self.it_a, self.al_a)
        self._member('dt_m2', self.team, self.it_a, self.al_a)
        row = self._row(self.team)
        self.assertEqual(row['italian_tl']['id'], self.it_a.id)
        self.assertEqual(row['albanian_tl']['id'], self.al_a.id)

    def test_majority_wins_and_ties_break_on_lowest_id(self):
        self._member('dt_m3', self.mixed, self.it_a, None)
        self._member('dt_m4', self.mixed, self.it_b, None)
        self._member('dt_m5', self.mixed, self.it_b, None)
        row = self._row(self.mixed)
        self.assertEqual(row['italian_tl']['id'], self.it_b.id)
        self.assertIsNone(row['albanian_tl'])

    def test_inactive_members_do_not_vote(self):
        self._member('dt_m6', self.mixed, self.it_a, None)
        self._member('dt_m7', self.mixed, self.it_b, None, active=False)
        self._member('dt_m8', self.mixed, self.it_b, None, active=False)
        self.assertEqual(self._row(self.mixed)['italian_tl']['id'], self.it_a.id)

    def test_empty_team_has_no_tls(self):
        row = self._row(self.empty)
        self.assertIsNone(row['italian_tl'])
        self.assertIsNone(row['albanian_tl'])

    def _list_queries(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        self.client.force_authenticate(self.admin)
        with CaptureQueriesContext(connection) as ctx:
            self.client.get('/api/users/teams/')
        return len(ctx)

    def test_list_query_count_does_not_grow_with_teams(self):
        self._member('dt_q_seed', self.team, self.it_a, self.al_a)
        before = self._list_queries()
        for i in range(3):
            t = Team.objects.create(name=f'Q{i}', code=f'Q{i}')
            self._member(f'dt_q{i}', t, self.it_a, self.al_a)
        self.assertEqual(self._list_queries(), before)
