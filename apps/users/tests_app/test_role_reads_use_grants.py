"""Role reads use database grants, not the legacy profile flags (audithandover.md S1 step 2).

A flag without a grant is drift (check_role_drift reports it). It must not grant
HR or leader capability, so these tests set only the flag and expect no access.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role
from core.mixins.permissions import has_hr_role, has_team_leader_role, is_hr_only

User = get_user_model()


class RoleReadsUseGrantsTests(TestCase):
    def setUp(self):
        for code, name in [('hr', 'HR'), ('italian_tl', 'Manager'), ('albanian_tl', 'Line Manager')]:
            Role.objects.get_or_create(code=code, defaults={'name': name})

    def _flagged(self, username, **flags):
        user = User.objects.create_user(username=username, password='x')
        for name, value in flags.items():
            setattr(user.profile, name, value)
        user.profile.save(update_fields=list(flags))
        user.refresh_from_db()
        return user

    def test_flag_without_grant_is_not_hr(self):
        user = self._flagged('flag_hr', is_hr_user=True)
        self.assertFalse(has_hr_role(user))
        self.assertFalse(is_hr_only(user))

    def test_grant_makes_pure_hr(self):
        user = User.objects.create_user(username='grant_hr', password='x')
        assign_role(user, 'hr')
        user = User.objects.get(pk=user.pk)
        self.assertTrue(has_hr_role(user))
        self.assertTrue(is_hr_only(user))

    def test_flag_without_grant_is_not_a_team_leader(self):
        user = self._flagged('flag_tl', is_italian_tl_role=True)
        self.assertFalse(has_team_leader_role(user))
        self.assertFalse(user.profile.is_team_leader)

    def test_profile_is_hr_reads_grants(self):
        user = self._flagged('flag_prop', is_hr_user=True)
        self.assertFalse(user.profile.is_hr)
