"""Orphan check: read-only list of users, teams and clients that nothing points at."""
from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.overtime.models import Client
from apps.users.models import Team, UserProfile
from apps.users.services.orphan_check import find_orphans

URL = '/api/users/teams/orphans/'


def make_user(name, **kwargs):
    user = User.objects.create_user(name, password='x', **kwargs)
    UserProfile.objects.get_or_create(user=user)
    return user


KEYS = ('users_without_team', 'teams_without_leader', 'empty_teams', 'unassigned_clients')


def ids(rows):
    return {row['id'] for row in rows}


def seeded():
    """Rows the migrations already put in the test database (e.g. a team without a leader)."""
    return {key: ids(rows) for key, rows in find_orphans().items()}


class FindOrphansTests(APITestCase):
    def setUp(self):
        self.seeded = seeded()
        self.leader = make_user('lead')
        self.member = make_user('mem')
        self.team = Team.objects.create(name='Alpha', code='ALP', team_leader=self.leader)
        self.member.profile.teams.add(self.team)

    def found(self, key):
        """Ids reported under ``key`` that this test did not start with."""
        return ids(find_orphans()[key]) - self.seeded[key]

    def test_clean_data_reports_nothing(self):
        for key in KEYS:
            self.assertEqual(self.found(key), set(), key)

    def test_active_employee_without_a_team_is_reported(self):
        loner = make_user('loner')
        self.assertEqual(self.found('users_without_team'), {loner.id})

    def test_leader_staff_inactive_and_non_team_roles_are_not_orphans(self):
        make_user('boss', is_staff=True)
        make_user('root', is_superuser=True)
        gone = make_user('gone')
        gone.is_active = False
        gone.save()
        hr = make_user('hrperson')
        hr.profile.role_codes = ['hr']
        hr.profile.save()
        self.assertEqual(self.found('users_without_team'), set())

    def test_member_and_leader_of_only_an_archived_team_are_orphans(self):
        Team.objects.filter(pk=self.team.pk).update(is_active=False)
        self.assertEqual(self.found('users_without_team'), {self.member.id, self.leader.id})

    def test_active_team_without_leader_is_reported_with_member_count(self):
        self.team.team_leader = None
        self.team.save()
        self.assertEqual(self.found('teams_without_leader'), {self.team.id})
        row = next(r for r in find_orphans()['teams_without_leader'] if r['id'] == self.team.id)
        self.assertEqual(row['members_count'], 1)

    def test_archived_team_is_never_reported(self):
        self.team.team_leader = None
        self.team.save()
        Team.objects.filter(pk=self.team.pk).update(is_active=False)
        self.assertEqual(self.found('teams_without_leader'), set())
        self.assertEqual(self.found('empty_teams'), set())

    def test_active_team_with_no_members_is_empty(self):
        empty = Team.objects.create(name='Beta', code='BET', team_leader=self.leader)
        self.assertEqual(self.found('empty_teams'), {empty.id})

    def test_active_client_nobody_works_on_is_unassigned(self):
        used = Client.objects.create(name='Used', code='U1')
        idle = Client.objects.create(name='Idle', code='I1')
        retired = Client.objects.create(name='Old', code='O1', is_active=False)
        self.member.profile.clients.add(used)
        self.assertEqual(self.found('unassigned_clients'), {idle.id})
        self.assertNotIn(retired.id, self.found('unassigned_clients'))


class OrphanEndpointTests(APITestCase):
    def test_admin_gets_the_report(self):
        self.client.force_authenticate(make_user('adm', is_staff=True))
        before = len(find_orphans()['users_without_team'])
        make_user('loner')
        resp = self.client.get(URL)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['users_without_team']), before + 1)
        self.assertEqual(
            set(resp.data),
            {'users_without_team', 'teams_without_leader', 'empty_teams', 'unassigned_clients'},
        )

    def test_regular_user_is_refused(self):
        self.client.force_authenticate(make_user('plain'))
        self.assertEqual(self.client.get(URL).status_code, 403)

    def test_anonymous_is_refused(self):
        self.assertIn(self.client.get(URL).status_code, (401, 403))
