"""A bulk approval resolves the leader set once, not once per row (audithandover.md L2)."""
from datetime import date
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.overtime.models import Client, OvertimeLog
from apps.permissions.services.permission_service import permission_service
from apps.permissions.services.role_service import assign_role
from apps.users.services import leader_ownership
from core.mixins.permissions import actor_team_scope_cached

User = get_user_model()


class LeaderSetOncePerBulkActionTests(TestCase):
    def setUp(self):
        self.leader = User.objects.create_user(username='l2_leader', password='x')
        assign_role(self.leader, 'albanian_tl')
        self.employee = User.objects.create_user(username='l2_emp', password='x')
        self.employee.profile.albanian_tl = self.leader
        self.employee.profile.save(update_fields=['albanian_tl'])
        client = Client.objects.create(name='L2', code='L2C')
        self.rows = [
            OvertimeLog.objects.create(
                user=self.employee, client=client, date=date(2026, 3, day), hours=1, status='pending',
            )
            for day in (10, 11, 12)
        ]
        # Load the actor's profile once so the cache lives on the same instance the checks use.
        self.leader = User.objects.get(pk=self.leader.pk)

    def test_bulk_context_resolves_the_leader_set_once(self):
        with mock.patch.object(leader_ownership, 'leader_user_ids', wraps=leader_ownership.leader_user_ids) as leaders:
            with actor_team_scope_cached(self.leader):
                results = [permission_service.can_approve(self.leader, row) for row in self.rows]
        self.assertEqual(results, [True, True, True])
        self.assertEqual(leaders.call_count, 1)

    def test_single_check_outside_a_bulk_action_still_decides_correctly(self):
        self.assertTrue(permission_service.can_approve(self.leader, self.rows[0]))
