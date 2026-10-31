"""Deactivating a leader in Django admin must say who is left without an approver."""
from types import SimpleNamespace
from unittest import mock

from django.contrib import admin
from django.contrib.auth.models import User
from django.test import RequestFactory, TestCase

from apps.users.models import Team


def make_user(name, **kwargs):
    return User.objects.create_user(name, email=f'{name}@example.com', password='x', **kwargs)


class UserAdminDeactivationWarningTests(TestCase):
    def setUp(self):
        self.model_admin = admin.site._registry[User]
        self.request = RequestFactory().post('/django-admin/auth/user/1/change/')
        self.request.user = make_user('root', is_staff=True, is_superuser=True)
        self.leader = make_user('lead')
        self.member = make_user('mem')
        self.team = Team.objects.create(name='Alpha', code='ALP', team_leader=self.leader)
        self.member.profile.teams.add(self.team)

    def save(self, user, changed):
        user.is_active = False
        with mock.patch('apps.users.admin.messages.warning') as warning:
            self.model_admin.save_model(self.request, user, SimpleNamespace(changed_data=changed), change=True)
        return warning

    def test_deactivating_a_leader_warns_with_the_teams_left_behind(self):
        warning = self.save(self.leader, ['is_active'])
        self.assertEqual(warning.call_count, 1)
        self.assertIn('Alpha', warning.call_args.args[1])
        self.leader.refresh_from_db()
        self.assertFalse(self.leader.is_active)

    def test_deactivating_a_plain_user_does_not_warn(self):
        self.assertFalse(self.save(self.member, ['is_active']).called)

    def test_editing_a_leader_without_deactivating_does_not_warn(self):
        self.leader.is_active = True
        with mock.patch('apps.users.admin.messages.warning') as warning:
            self.model_admin.save_model(
                self.request, self.leader, SimpleNamespace(changed_data=['first_name']), change=True
            )
        self.assertFalse(warning.called)
