"""UserRoleViewSet writes go through assign_role/revoke_role (audithandover.md M3).

A grant or revoke over the API must sync the legacy profile flag, a revoke must
keep the row (history), and a revoke that would strand a leader's members is
refused. Direct row edits (PUT/PATCH) are not offered at all.
"""
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from apps.permissions.models import Role, UserRole
from apps.permissions.services.role_service import assign_role

User = get_user_model()


class UserRoleApiGuardTests(APITestCase):
    def setUp(self):
        self.hr_role, _ = Role.objects.get_or_create(code='hr', defaults={'name': 'HR'})
        self.tl_role, _ = Role.objects.get_or_create(code='italian_tl', defaults={'name': 'Manager'})
        self.su = User.objects.create_user(
            username='m3_su', password='x', is_staff=True, is_superuser=True)
        self.victim = User.objects.create_user(username='m3_victim', password='x')
        self.leader = User.objects.create_user(username='m3_leader', password='x')
        assign_role(self.leader, 'italian_tl')
        assign_role(self.leader, 'italian_tl')
        assign_role(self.leader, 'italian_tl')
        self.member = User.objects.create_user(username='m3_member', password='x')
        self.member.profile.italian_tl = self.leader
        self.member.profile.save(update_fields=['italian_tl'])
        self.api = APIClient()
        self.api.force_authenticate(self.su)

    def _url(self, pk=None):
        base = '/api/permissions/user-roles/'
        return f'{base}{pk}/' if pk else base

    def test_put_is_not_offered(self):
        grant = assign_role(self.victim, 'hr')
        resp = self.api.put(self._url(grant.id), {
            'user': self.victim.id, 'role': self.hr_role.id, 'is_active': False}, format='json')
        self.assertEqual(resp.status_code, 405)
        grant.refresh_from_db()
        self.assertTrue(grant.is_active)

    def test_grant_sets_the_legacy_flag(self):
        resp = self.api.post(self._url(), {
            'user': self.victim.id, 'role': self.hr_role.id}, format='json')
        self.assertIn(resp.status_code, (200, 201), getattr(resp, 'data', None))
        self.assertTrue(UserRole.objects.filter(
            user=self.victim, role=self.hr_role, team__isnull=True, is_active=True).exists())
        self.victim.profile.refresh_from_db()
        self.assertTrue(self.victim.profile.is_hr)

    def test_revoke_keeps_the_row_and_clears_the_flag(self):
        assign_role(self.victim, 'hr')
        assign_role(self.victim, 'hr')
        assign_role(self.victim, 'hr')
        row = UserRole.objects.get(user=self.victim, role=self.hr_role, team__isnull=True)
        resp = self.api.delete(self._url(row.id))
        self.assertIn(resp.status_code, (200, 204), getattr(resp, 'data', None))
        row.refresh_from_db()
        self.assertFalse(row.is_active)
        self.victim.profile.refresh_from_db()
        self.assertFalse(self.victim.profile.is_hr)

    def test_revoke_refused_while_members_still_point_at_the_leader(self):
        row = UserRole.objects.get(user=self.leader, role=self.tl_role, team__isnull=True)
        resp = self.api.delete(self._url(row.id))
        self.assertEqual(resp.status_code, 400, getattr(resp, 'data', None))
        row.refresh_from_db()
        self.assertTrue(row.is_active)
        self.leader.profile.refresh_from_db()
        self.assertTrue(self.leader.profile.is_italian_tl)
