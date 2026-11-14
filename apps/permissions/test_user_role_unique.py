"""A user can hold one global (team-less) grant of a role; NULL team must not bypass uniqueness (M5)."""
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase

from apps.permissions.models import Role, UserRole

User = get_user_model()


class GlobalRoleUniquenessTests(TestCase):
    def setUp(self):
        self.role, _ = Role.objects.get_or_create(code='hr', defaults={'name': 'HR'})
        self.user = User.objects.create_user(username='uniq_user', password='x')

    def test_second_global_grant_of_same_role_is_refused(self):
        UserRole.objects.create(user=self.user, role=self.role, team=None, is_active=True)
        with self.assertRaises(IntegrityError), transaction.atomic():
            UserRole.objects.create(user=self.user, role=self.role, team=None, is_active=True)

    def test_same_role_scoped_to_different_teams_is_still_allowed(self):
        from apps.users.models import Team

        t1 = Team.objects.create(name='U1', code='U1')
        t2 = Team.objects.create(name='U2', code='U2')
        UserRole.objects.create(user=self.user, role=self.role, team=t1, is_active=True)
        UserRole.objects.create(user=self.user, role=self.role, team=t2, is_active=True)
        self.assertEqual(UserRole.objects.filter(user=self.user, role=self.role).count(), 2)
