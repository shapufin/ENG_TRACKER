"""`add_teams` joins teams without replacing the ones a person is in, whatever the caller last saw."""
from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.users.models import Team, UserProfile


def make_user(name, **kwargs):
    user = User.objects.create_user(name, password='x', **kwargs)
    UserProfile.objects.get_or_create(user=user)
    return user


class AddTeamsTests(APITestCase):
    def setUp(self):
        self.admin = make_user('adm', is_staff=True)
        self.client.force_authenticate(self.admin)
        self.user = make_user('ana')
        self.alpha = Team.objects.create(name='Alpha', code='ALP')
        self.beta = Team.objects.create(name='Beta', code='BET')
        self.gamma = Team.objects.create(name='Gamma', code='GAM')
        self.user.profile.teams.add(self.alpha)
        self.url = f'/api/users/users/{self.user.pk}/update_user/'

    def teams(self):
        return set(self.user.profile.teams.values_list('code', flat=True))

    def test_adds_next_to_current_teams(self):
        resp = self.client.put(self.url, {'add_teams': [self.beta.pk]}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(self.teams(), {'ALP', 'BET'})

    def test_a_team_joined_since_the_page_loaded_is_kept(self):
        # The caller loaded the page when Ana was only in Alpha; another admin then added Gamma.
        self.user.profile.teams.add(self.gamma)
        self.client.put(self.url, {'add_teams': [self.beta.pk]}, format='json')
        self.assertEqual(self.teams(), {'ALP', 'GAM', 'BET'})

    def test_adding_a_team_she_is_already_in_changes_nothing(self):
        resp = self.client.put(self.url, {'add_teams': [self.alpha.pk]}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(self.teams(), {'ALP'})

    def test_an_archived_team_is_refused_and_nothing_changes(self):
        Team.objects.filter(pk=self.beta.pk).update(is_active=False)
        resp = self.client.put(self.url, {'add_teams': [self.beta.pk]}, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(self.teams(), {'ALP'})

    def test_bad_input_is_a_400(self):
        for bad in ('x', [self.beta.pk, 'y'], [999999]):
            resp = self.client.put(self.url, {'add_teams': bad}, format='json')
            self.assertEqual(resp.status_code, 400, bad)
        self.assertEqual(self.teams(), {'ALP'})

    def test_an_explicit_teams_list_still_replaces(self):
        self.client.put(self.url, {'teams': [self.gamma.pk]}, format='json')
        self.assertEqual(self.teams(), {'GAM'})
