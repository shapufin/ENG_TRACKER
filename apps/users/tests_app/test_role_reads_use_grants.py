"""Role identity comes from UserRole grants only (audithandover.md S1).

The legacy profile columns is_hr_user, is_italian_tl_role and is_albanian_tl_role
are dropped. These tests pin the grant-based predicates and the absence of the
columns, so a later change cannot bring a flag back as an authority source.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role
from apps.users.models import UserProfile
from core.mixins.permissions import has_hr_role, has_team_leader_role, is_hr_only

User = get_user_model()


class RoleReadsUseGrantsTests(TestCase):
    def setUp(self):
        for code, name in [('hr', 'HR'), ('italian_tl', 'Manager'), ('albanian_tl', 'Line Manager')]:
            Role.objects.get_or_create(code=code, defaults={'name': name})

    def test_legacy_columns_are_gone(self):
        field_names = {f.name for f in UserProfile._meta.get_fields()}
        self.assertFalse(field_names & {'is_hr_user', 'is_italian_tl_role', 'is_albanian_tl_role'})

    def test_no_grant_means_no_hr(self):
        user = User.objects.create_user(username='plain', password='x')
        self.assertFalse(has_hr_role(user))
        self.assertFalse(is_hr_only(user))

    def test_grant_makes_pure_hr(self):
        user = User.objects.create_user(username='grant_hr', password='x')
        assign_role(user, 'hr')
        user = User.objects.get(pk=user.pk)
        self.assertTrue(has_hr_role(user))
        self.assertTrue(is_hr_only(user))
        self.assertTrue(user.profile.is_hr)

    def test_manager_grant_is_a_team_leader(self):
        user = User.objects.create_user(username='grant_tl', password='x')
        assign_role(user, 'italian_tl')
        user = User.objects.get(pk=user.pk)
        self.assertTrue(has_team_leader_role(user))
        self.assertTrue(user.profile.is_italian_tl)
