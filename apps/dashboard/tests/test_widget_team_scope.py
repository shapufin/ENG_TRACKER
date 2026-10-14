"""SEC-05: dashboard widget actions must not accept a foreign ``team_id``."""
from django.contrib.auth.models import User
from django.core.cache import cache
from rest_framework.test import APITestCase

from apps.users.models import Team

WIDGET_URL = '/api/dashboard/widgets/{}/'
TEAM_SCOPED_ACTIONS = ('team_stats', 'pending_trend', 'top_pending_users', 'queue_highlights')


class DashboardWidgetTeamScopeTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.tl = User.objects.create_user(username='dw_tl', password='x')
        cls.employee = User.objects.create_user(username='dw_emp', password='x')
        cls.victim = User.objects.create_user(username='dw_victim', password='x')
        cls.admin = User.objects.create_user(username='dw_admin', password='x', is_staff=True)
        cls.hr = User.objects.create_user(username='dw_hr', password='x')
        cls.hr.profile.is_hr_user = True
        cls.hr.profile.save()

        cls.own_team = Team.objects.create(name='DW Own', code='DWO', team_leader=cls.tl)
        cls.tl.profile.teams.add(cls.own_team)
        cls.employee.profile.teams.add(cls.own_team)
        cls.foreign_team = Team.objects.create(name='DW Foreign', code='DWF')
        cls.victim.profile.teams.add(cls.foreign_team)

    def setUp(self):
        cache.clear()

    def _get(self, user, action, **params):
        self.client.force_authenticate(user)
        return self.client.get(WIDGET_URL.format(action), params)

    def test_employee_and_tl_get_404_for_foreign_team(self):
        for user in (self.employee, self.tl):
            for action in TEAM_SCOPED_ACTIONS:
                with self.subTest(user=user.username, action=action):
                    resp = self._get(user, action, team_id=self.foreign_team.id)
                    self.assertEqual(resp.status_code, 404)

    def test_member_can_still_query_own_team(self):
        for user in (self.employee, self.tl):
            for action in TEAM_SCOPED_ACTIONS:
                with self.subTest(user=user.username, action=action):
                    resp = self._get(user, action, team_id=self.own_team.id)
                    self.assertEqual(resp.status_code, 200)

    def test_staff_and_hr_can_query_any_team(self):
        for user in (self.admin, self.hr):
            with self.subTest(user=user.username):
                resp = self._get(user, 'team_stats', team_id=self.foreign_team.id)
                self.assertEqual(resp.status_code, 200)
                self.assertEqual(resp.data['team_size'], 2)  # victim + the caller

    def test_non_numeric_team_id_is_not_a_server_error(self):
        resp = self._get(self.tl, 'team_stats', team_id='abc')
        self.assertEqual(resp.status_code, 404)

    def test_bad_limit_returns_400(self):
        for action in ('top_pending_users', 'queue_highlights'):
            for bad in ('abc', '-3', '0'):
                with self.subTest(action=action, limit=bad):
                    resp = self._get(self.tl, action, limit=bad)
                    self.assertEqual(resp.status_code, 400)
