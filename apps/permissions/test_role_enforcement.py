from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.overtime.models import Client, OvertimeLog
from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role
from apps.permissions.services.permission_service import permission_service


User = get_user_model()


class DatabaseRoleEnforcementTests(TestCase):
    def setUp(self):
        self.hr_role, _ = Role.objects.get_or_create(
            code='hr', defaults={'name': 'HR', 'description': 'HR role'}
        )
        self.tl_role, _ = Role.objects.get_or_create(
            code='italian_tl', defaults={'name': 'Italian TL', 'description': 'TL role'}
        )
        self.client = Client.objects.create(name='Role Client', code='ROLE')

    def test_role_only_hr_can_approve(self):
        user = User.objects.create_user(username='role-only-hr', password='testpass')
        assign_role(user, self.hr_role.code)
        member = User.objects.create_user(username='role-member', password='testpass')
        entry = OvertimeLog.objects.create(
            user=member, client=self.client, date=date(2026, 8, 4),
            hours=Decimal('2.00'), description='role-only', status='pending',
        )
        self.assertTrue(permission_service.can_approve(user, entry))

    def test_role_only_tl_is_scoped_by_team_relationship(self):
        user = User.objects.create_user(username='role-only-tl', password='testpass')
        assign_role(user, self.tl_role.code)
        member = User.objects.create_user(username='role-member-2', password='testpass')
        member.profile.italian_tl = user
        member.profile.save(update_fields=['italian_tl'])
        entry = OvertimeLog.objects.create(
            user=member, client=self.client, date=date(2026, 8, 4),
            hours=Decimal('2.00'), description='role-only-tl', status='pending',
        )
        self.assertTrue(permission_service.can_approve(user, entry))
