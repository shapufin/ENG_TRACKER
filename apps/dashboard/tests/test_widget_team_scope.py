"""SEC-05: dashboard widget actions must not accept a foreign ``team_id``."""
from django.contrib.auth.models import User
from django.core.cache import cache
from rest_framework.test import APITestCase

from django.utils import timezone

from apps.overtime.models.core import Client, OvertimeLog
from apps.users.models import Team

WIDGET_URL = '/api/dashboard/widgets/{}/'
TEAM_SCOPED_ACTIONS = ('team_stats', 'pending_trend', 'top_pending_users', 'queue_highlights')


class DashboardWidgetTeamScopeTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.tl = User.objects.create_user(username='dw_tl', password='x')
        cls.employee = User.objects.create_user(username='dw_emp', password='x')
        cls.victim = User.objects.create_user(
            username='dw_victim', password='x', first_name='Vivian', last_name='Victim')
        cls.employee.first_name, cls.employee.last_name = 'Olive', 'Own'
        cls.employee.save()
        cls.admin = User.objects.create_user(username='dw_admin', password='x', is_staff=True)
        cls.hr = User.objects.create_user(username='dw_hr', password='x')
        cls.hr.profile.is_hr_user = True
        cls.hr.profile.save()

        cls.own_team = Team.objects.create(name='DW Own', code='DWO', team_leader=cls.tl)
        cls.tl.profile.teams.add(cls.own_team)
        cls.employee.profile.teams.add(cls.own_team)
        cls.foreign_team = Team.objects.create(name='DW Foreign', code='DWF')
        cls.victim.profile.teams.add(cls.foreign_team)

        client = Client.objects.create(name='DW Client', code='DWC')
        for user in (cls.employee, cls.victim):
            OvertimeLog.objects.create(
                user=user, date=timezone.now().date(), hours=2, status='pending', client=client)

    def setUp(self):
        cache.clear()

    def _get(self, user, action, **params):
        self.client.force_authenticate(user)
        return self.client.get(WIDGET_URL.format(action), params)

    def test_tl_gets_404_for_foreign_team(self):
        for action in TEAM_SCOPED_ACTIONS:
            with self.subTest(action=action):
                resp = self._get(self.tl, action, team_id=self.foreign_team.id)
                self.assertEqual(resp.status_code, 404)

    def test_team_leader_can_query_own_team(self):
        for action in TEAM_SCOPED_ACTIONS + ('monthly_comparison',):
            with self.subTest(action=action):
                resp = self._get(self.tl, action, team_id=self.own_team.id)
                self.assertEqual(resp.status_code, 200)

    def test_employee_is_refused_every_team_widget(self):
        # Team confidentiality (2026-10-20): teammates' statuses and pending
        # counts are the TL's management data, not an employee's.
        for action in TEAM_SCOPED_ACTIONS + ('monthly_comparison',):
            for params in ({}, {'team_id': self.own_team.id}, {'team_id': self.foreign_team.id}):
                with self.subTest(action=action, params=params):
                    self.assertEqual(self._get(self.employee, action, **params).status_code, 403)

    def test_team_leader_sees_only_own_team_names(self):
        for action in ('top_pending_users', 'queue_highlights'):
            with self.subTest(action=action):
                resp = self._get(self.tl, action)
                self.assertEqual(resp.status_code, 200)
                self.assertIn('Olive Own', str(resp.data))
                self.assertNotIn('Vivian', str(resp.data))

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


class LedTeamOnlyLeaderTests(APITestCase):
    """A user who leads a team only through ``Team.team_leader`` is a TL (no role flag)."""

    @classmethod
    def setUpTestData(cls):
        cls.lead = User.objects.create_user(username='dw_led', password='x')
        cls.member = User.objects.create_user(
            username='dw_led_member', password='x', first_name='Mona', last_name='Member')
        cls.other = User.objects.create_user(
            username='dw_led_other', password='x', first_name='Orla', last_name='Other')
        cls.team_a = Team.objects.create(name='DW Led A', code='DLA')
        cls.team_b = Team.objects.create(name='DW Led B', code='DLB')
        # Deliberately set after creation and with no role flag on the profile.
        Team.objects.filter(pk=cls.team_a.pk).update(team_leader=cls.lead)
        cls.lead.profile.teams.add(cls.team_a)
        cls.member.profile.teams.add(cls.team_a)
        cls.other.profile.teams.add(cls.team_b)
        client = Client.objects.create(name='DW Led Client', code='DLC')
        for user in (cls.member, cls.other):
            OvertimeLog.objects.create(
                user=user, date=timezone.now().date(), hours=2, status='pending', client=client)

    def setUp(self):
        cache.clear()
        self.client.force_authenticate(self.lead)

    def test_led_team_only_user_has_no_role_flag(self):
        # No TL role code or legacy flag: authority comes from ``led_teams`` via
        # ``profile.is_team_leader``, which ``has_team_leader_role`` reads.
        profile = self.lead.profile
        self.assertFalse(profile.is_italian_tl_role or profile.is_albanian_tl_role)
        self.assertFalse(set(profile.role_codes or []) & {'italian_tl', 'albanian_tl'})

    def test_gets_own_team_data(self):
        for action in ('top_pending_users', 'queue_highlights'):
            with self.subTest(action=action):
                resp = self.client.get(WIDGET_URL.format(action), {'team_id': self.team_a.id})
                self.assertEqual(resp.status_code, 200)
                self.assertIn('Mona Member', str(resp.data))
                self.assertNotIn('Orla', str(resp.data))

    def test_gets_404_for_other_team(self):
        resp = self.client.get(WIDGET_URL.format('team_stats'), {'team_id': self.team_b.id})
        self.assertEqual(resp.status_code, 404)
