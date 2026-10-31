"""Suggested team moves: someone works a client that nobody on their own team works."""
from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.overtime.models import Client
from apps.users.models import Team, UserProfile
from apps.users.services.team_suggestions import suggest_team_moves

URL = '/api/users/teams/suggestions/'


def make_user(name, **kwargs):
    user = User.objects.create_user(name, password='x', **kwargs)
    UserProfile.objects.get_or_create(user=user)
    return user


def mine(rows, user):
    """The suggestion row for ``user`` (None when there is none)."""
    return next((r for r in rows if r['user_id'] == user.id), None)


class SuggestTeamMovesTests(APITestCase):
    def setUp(self):
        self.acme = Client.objects.create(name='Acme', code='ACM')
        self.beta = Client.objects.create(name='Beta', code='BET')
        self.alpha = Team.objects.create(name='Alpha', code='ALP')
        self.gamma = Team.objects.create(name='Gamma', code='GAM')
        self.ana = make_user('ana')
        self.bob = make_user('bob')
        self.ana.profile.teams.add(self.alpha)
        self.bob.profile.teams.add(self.gamma)
        self.bob.profile.clients.add(self.acme)

    def test_client_nobody_on_own_team_works_points_at_the_team_that_does(self):
        self.ana.profile.clients.add(self.acme)
        row = mine(suggest_team_moves(), self.ana)
        self.assertEqual(row['team_ids'], [self.alpha.id])
        self.assertEqual(row['suggestions'][0]['client']['code'], 'ACM')
        self.assertEqual(
            [(t['id'], t['sharing']) for t in row['suggestions'][0]['teams']], [(self.gamma.id, 1)]
        )

    def test_no_suggestion_when_a_teammate_already_works_the_client(self):
        mate = make_user('mate')
        mate.profile.teams.add(self.alpha)
        mate.profile.clients.add(self.acme)
        self.ana.profile.clients.add(self.acme)
        self.assertIsNone(mine(suggest_team_moves(), self.ana))

    def test_no_suggestion_when_no_team_has_anyone_on_the_client(self):
        self.ana.profile.clients.add(self.beta)
        self.assertIsNone(mine(suggest_team_moves(), self.ana))

    def test_someone_in_no_team_is_offered_the_teams_on_their_client(self):
        loner = make_user('loner')
        loner.profile.clients.add(self.acme)
        row = mine(suggest_team_moves(), loner)
        self.assertEqual(row['team_ids'], [])
        self.assertEqual(row['suggestions'][0]['teams'][0]['id'], self.gamma.id)

    def test_best_team_comes_first(self):
        carl = make_user('carl')
        carl.profile.teams.add(self.gamma)
        carl.profile.clients.add(self.acme)
        dina = make_user('dina')
        dina.profile.teams.add(self.alpha)
        dina.profile.clients.add(self.beta)
        eve = make_user('eve')
        eve.profile.teams.add(self.alpha)
        eve.profile.clients.add(self.acme)
        newcomer = make_user('newcomer')
        newcomer.profile.clients.add(self.acme)
        teams = mine(suggest_team_moves(), newcomer)['suggestions'][0]['teams']
        self.assertEqual([(t['id'], t['sharing']) for t in teams], [(self.gamma.id, 2), (self.alpha.id, 1)])

    def test_archived_clients_teams_staff_and_inactive_users_are_left_out(self):
        old = Client.objects.create(name='Old', code='OLD', is_active=False)
        self.bob.profile.clients.add(old)
        self.ana.profile.clients.add(old)
        staff = make_user('staffer', is_staff=True)
        staff.profile.clients.add(self.acme)
        gone = make_user('gone')
        gone.is_active = False
        gone.save()
        gone.profile.clients.add(self.acme)
        Team.objects.filter(pk=self.gamma.pk).update(is_active=False)
        self.ana.profile.clients.add(self.acme)
        rows = suggest_team_moves()
        for user in (self.ana, staff, gone):
            self.assertIsNone(mine(rows, user), user.username)


class SuggestionsEndpointTests(APITestCase):
    def test_admin_gets_rows_and_a_regular_user_is_refused(self):
        self.client.force_authenticate(make_user('adm', is_staff=True))
        resp = self.client.get(URL)
        self.assertEqual(resp.status_code, 200)
        self.assertIsInstance(resp.data, list)
        self.client.force_authenticate(make_user('plain'))
        self.assertEqual(self.client.get(URL).status_code, 403)
