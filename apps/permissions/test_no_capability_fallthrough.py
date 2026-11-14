"""can_approve must decide by role predicates and team scope only.

The database capability fall-through (has_permission) was read by nothing that decided
access, except that a bare ``admin`` role made it return True and skipped team scope and
the owner rule. Removed on owner ruling D2 (audithandover.md, 2026-11-14).
"""
from datetime import time

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.overtime.models import Client, OvertimeLog
from apps.permissions.models import Role
from apps.permissions.services.permission_service import permission_service
from apps.permissions.services.role_service import assign_role

User = get_user_model()


class NoCapabilityFallthroughTests(TestCase):
    def setUp(self):
        Role.objects.get_or_create(code='admin', defaults={'name': 'admin'})
        self.admin_role_user = User.objects.create_user(username='ft_admin_role', password='x')
        assign_role(self.admin_role_user, 'admin')
        self.employee = User.objects.create_user(username='ft_employee', password='x')
        self.log = OvertimeLog.objects.create(
            user=self.employee, client=Client.objects.create(name='Fallthrough Client'),
            date='2026-12-04', hours=2.0, start_time=time(18, 0), end_time=time(20, 0),
            description='x',
        )

    def test_bare_admin_role_cannot_approve_someone_elses_row(self):
        self.assertFalse(permission_service.can_approve(self.admin_role_user, self.log))
