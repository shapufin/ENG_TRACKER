"""Phase 6 (permissions/users audit): role administration, self-approval, revoke cache."""
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from apps.leave_management.models import LeaveBalance, LeaveRequest
from apps.permissions.models import Permission, Role, RolePermission, UserRole
from apps.permissions.services.permission_service import permission_service
from apps.permissions.services.role_service import assign_role, revoke_role

User = get_user_model()


class StaffRoleAdministrationTests(APITestCase):
    def setUp(self):
        self.admin_role, _ = Role.objects.get_or_create(code='admin', defaults={'name': 'admin'})
        self.staff = User.objects.create_user(username='p6r_staff', password='x', is_staff=True)
        self.su = User.objects.create_user(
            username='p6r_su', password='x', is_staff=True, is_superuser=True)
        self.victim = User.objects.create_user(username='p6r_victim', password='x')
        self.api = APIClient()

    def _perm_url(self, name):
        return f'/api/permissions/{name}/'

    def test_staff_cannot_grant_admin_role_via_user_roles(self):
        self.api.force_authenticate(self.staff)
        resp = self.api.post(self._perm_url('user-roles'), {
            'user': self.staff.id, 'role': self.admin_role.id, 'is_active': True}, format='json')
        self.assertEqual(resp.status_code, 403, getattr(resp, 'data', None))
        self.assertFalse(UserRole.objects.filter(user=self.staff, role=self.admin_role).exists())

    def test_staff_cannot_grant_role_permission(self):
        perm = Permission.objects.create(module='p6mod', action='view')
        self.api.force_authenticate(self.staff)
        resp = self.api.post(self._perm_url('role-permissions'), {
            'role': self.admin_role.id, 'permission': perm.id}, format='json')
        self.assertEqual(resp.status_code, 403, getattr(resp, 'data', None))
        self.assertFalse(RolePermission.objects.filter(permission=perm).exists())

    def test_staff_cannot_create_role(self):
        self.api.force_authenticate(self.staff)
        resp = self.api.post(self._perm_url('roles'), {'name': 'P6', 'code': 'p6role'}, format='json')
        self.assertEqual(resp.status_code, 403, getattr(resp, 'data', None))
        self.assertFalse(Role.objects.filter(code='p6role').exists())

    def test_staff_can_still_read_roles(self):
        self.api.force_authenticate(self.staff)
        for name in ('roles', 'user-roles', 'role-permissions'):
            self.assertEqual(self.api.get(self._perm_url(name)).status_code, 200, name)

    def test_superuser_can_grant_role(self):
        self.api.force_authenticate(self.su)
        resp = self.api.post(self._perm_url('user-roles'), {
            'user': self.victim.id, 'role': self.admin_role.id, 'is_active': True}, format='json')
        self.assertIn(resp.status_code, (200, 201), getattr(resp, 'data', None))


class SelfApprovalTests(APITestCase):
    def _own_pending_leave(self, user):
        balance = LeaveBalance.objects.create(
            user=user, leave_type='vacation', year=2026, total_days=20,
            accrual_start_date=date(2000, 1, 1))
        return LeaveRequest.objects.create(
            user=user, start_date=date(2026, 12, 7), end_date=date(2026, 12, 7),
            request_type='vacation', reason='own', status='pending', balance=balance)

    def _approve(self, actor):
        leave = self._own_pending_leave(actor)
        api = APIClient()
        api.force_authenticate(actor)
        resp = api.post(f'/api/leave-management/requests/{leave.id}/approve/', {}, format='json')
        leave.refresh_from_db()
        return resp, leave

    def test_hr_cannot_approve_own_leave(self):
        Role.objects.get_or_create(code='hr', defaults={'name': 'hr'})
        hr = User.objects.create_user(username='p6s_hr', password='x')
        assign_role(hr, 'hr')
        resp, leave = self._approve(hr)
        self.assertIn(resp.status_code, (403, 404), resp.data)
        self.assertEqual(leave.status, 'pending')

    def test_staff_cannot_approve_own_leave(self):
        staff = User.objects.create_user(username='p6s_staff', password='x', is_staff=True)
        resp, leave = self._approve(staff)
        self.assertIn(resp.status_code, (403, 404), resp.data)
        self.assertEqual(leave.status, 'pending')

    def test_hr_can_approve_someone_elses_leave(self):
        Role.objects.get_or_create(code='hr', defaults={'name': 'hr'})
        hr = User.objects.create_user(username='p6s_hr2', password='x')
        assign_role(hr, 'hr')
        other = User.objects.create_user(username='p6s_other', password='x')
        leave = self._own_pending_leave(other)
        api = APIClient()
        api.force_authenticate(hr)
        resp = api.post(f'/api/leave-management/requests/{leave.id}/approve/', {}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)


class RevokeRoleCacheTests(APITestCase):
    def test_revoke_invalidates_permission_cache(self):
        role, _ = Role.objects.get_or_create(code='p6cache', defaults={'name': 'p6cache'})
        perm = Permission.objects.create(module='p6cachemod', action='view')
        RolePermission.objects.create(role=role, permission=perm)
        user = User.objects.create_user(username='p6c_user', password='x')
        assign_role(user, 'p6cache')
        self.assertTrue(permission_service.has_permission(user, 'p6cachemod', 'view'))
        revoke_role(user, 'p6cache')
        self.assertFalse(permission_service.has_permission(user, 'p6cachemod', 'view'))
