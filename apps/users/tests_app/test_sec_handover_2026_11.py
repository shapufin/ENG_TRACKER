"""Handover SEC-01 (reset_all_passwords guard) and SEC-02 (italian_team_members IDOR)."""
from io import StringIO

from django.contrib.auth.models import User
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from rest_framework.test import APITestCase


class ItalianTeamMembersScopeTests(APITestCase):
    URL = '/api/users/users/italian_team_members/'

    @classmethod
    def setUpTestData(cls):
        cls.manager = User.objects.create_user(username='itm_mgr', password='x')
        cls.other_manager = User.objects.create_user(username='itm_mgr2', password='x')
        cls.member = User.objects.create_user(username='itm_member', password='x')
        cls.member.profile.italian_tl = cls.manager
        cls.member.profile.save()
        cls.outsider = User.objects.create_user(username='itm_out', password='x')
        cls.staff = User.objects.create_user(username='itm_staff', password='x', is_staff=True)
        cls.hr = User.objects.create_user(username='itm_hr', password='x')
        cls.hr.profile.is_hr_user = True
        cls.hr.profile.save()

    def _get(self, user, tl_id):
        self.client.force_authenticate(user)
        return self.client.get(self.URL, {'italian_tl_id': tl_id})

    def test_employee_cannot_list_another_managers_team(self):
        self.assertEqual(self._get(self.outsider, self.manager.id).status_code, 403)

    def test_member_cannot_list_their_own_managers_team(self):
        self.assertEqual(self._get(self.member, self.manager.id).status_code, 403)

    def test_manager_cannot_list_another_managers_team(self):
        self.assertEqual(self._get(self.other_manager, self.manager.id).status_code, 403)

    def test_manager_lists_own_team(self):
        resp = self._get(self.manager, self.manager.id)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)

    def test_staff_and_hr_may_list_any_team(self):
        self.assertEqual(self._get(self.staff, self.manager.id).status_code, 200)
        self.assertEqual(self._get(self.hr, self.manager.id).status_code, 200)

    def test_non_numeric_id_is_a_400_not_a_500(self):
        self.assertEqual(self._get(self.staff, 'abc').status_code, 400)


class ResetAllPasswordsGuardTests(TestCase):
    def _run(self):
        call_command('reset_all_passwords', 'Temp-pass-123', '--yes', stdout=StringIO())

    @override_settings(DEBUG=False)
    def test_refuses_outside_debug(self):
        user = User.objects.create_user(username='rap_user', password='original-pass')
        with self.assertRaises(CommandError):
            self._run()
        user.refresh_from_db()
        self.assertTrue(user.check_password('original-pass'))

    @override_settings(DEBUG=True)
    def test_runs_in_debug(self):
        user = User.objects.create_user(username='rap_user2', password='original-pass')
        self._run()
        user.refresh_from_db()
        self.assertTrue(user.check_password('Temp-pass-123'))


class TokenThrottleScopeTests(TestCase):
    """SEC-05: refresh must not drain the shared per-IP ``anon`` bucket; login keeps it."""

    def test_refresh_uses_only_the_auth_scope(self):
        from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle

        from apps.users.views.auth import CustomTokenRefreshView

        self.assertEqual(CustomTokenRefreshView.throttle_scope, 'auth')
        self.assertEqual(CustomTokenRefreshView.throttle_classes, [ScopedRateThrottle])
        self.assertNotIn(AnonRateThrottle, CustomTokenRefreshView.throttle_classes)

    def test_login_keeps_the_anon_cap(self):
        from rest_framework.throttling import AnonRateThrottle

        from apps.users.views.auth import CustomTokenObtainPairView

        self.assertIn(AnonRateThrottle, CustomTokenObtainPairView.throttle_classes)
