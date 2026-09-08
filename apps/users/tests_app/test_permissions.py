from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.test import TestCase
from unittest.mock import patch

from apps.dashboard.models.calendar import CalendarWorkspace
from apps.leave_management.models import LeaveBalance
from apps.overtime.models import Client, OvertimeLog
from apps.users.models import Team, TeamMembership
from apps.permissions.services.permission_service import permission_service
from apps.permissions.models import Permission, RolePermission
from core.mixins.permissions import (
    ApprovalPermissionMixin,
    DeletePermissionMixin,
    HRReadOnlyMixin,
    WorkspaceFilterMixin,
    is_hr_only,
)


User = get_user_model()


class UserProfileTeamMemberTests(TestCase):
    def setUp(self):
        self.tl = User.objects.create_user(username='tl', password='testpass')
        self.team = Team.objects.create(name='Core Team', code='CORE')
        TeamMembership.objects.create(user_profile=self.tl.profile, team=self.team, is_primary_team=True)

        self.team_member = User.objects.create_user(username='member', password='testpass')
        TeamMembership.objects.create(user_profile=self.team_member.profile, team=self.team, is_primary_team=True)

        self.italian_direct = User.objects.create_user(username='italian', password='testpass')
        self.albanian_direct = User.objects.create_user(username='albanian', password='testpass')

    def test_get_team_member_ids_includes_team_members(self):
        ids = self.tl.profile.get_team_member_ids()
        self.assertIn(self.team_member.id, ids)

    def test_get_team_member_ids_includes_direct_tl_assignments(self):
        profile = self.tl.profile
        profile.is_italian_tl_role = True
        profile.is_albanian_tl_role = True
        profile.save()

        self.italian_direct.profile.italian_tl = self.tl
        self.italian_direct.profile.save()

        self.albanian_direct.profile.albanian_tl = self.tl
        self.albanian_direct.profile.save()

        ids = self.tl.profile.get_team_member_ids()
        self.assertIn(self.italian_direct.id, ids)
        self.assertIn(self.albanian_direct.id, ids)

    def test_get_team_member_ids_empty_without_relationships(self):
        outsider = User.objects.create_user(username='outsider', password='testpass')
        self.assertEqual(outsider.profile.get_team_member_ids(), set())

    def test_get_team_member_ids_includes_led_teams_members(self):
        """TLs set only via Team.team_leader must still see team members."""
        leader = User.objects.create_user(username='led-tl', password='testpass')
        member = User.objects.create_user(username='led-member', password='testpass')
        team = Team.objects.create(name='Led Team', code='LED', team_leader=leader)
        # Leader is NOT a TeamMembership member — authority is led_teams only.
        TeamMembership.objects.create(user_profile=member.profile, team=team, is_primary_team=True)

        self.assertTrue(leader.profile.is_team_leader)
        ids = leader.profile.get_team_member_ids()
        self.assertIn(member.id, ids)

    def test_team_traversal_stops_on_parent_cycle(self):
        first = Team.objects.create(name='Cycle First', code='CYCLE-1')
        second = Team.objects.create(name='Cycle Second', code='CYCLE-2', parent_team=first)
        first.parent_team = second
        first.save(update_fields=['parent_team'])

        self.assertEqual([team.id for team in first.get_hierarchy()], [first.id, second.id])
        self.assertEqual([team.id for team in first.get_all_sub_teams()], [second.id])

    def test_permission_cache_failure_still_evaluates_permission(self):
        from apps.permissions.models import Role, UserRole

        role = Role.objects.create(name='Cache Role', code='cache-role')
        permission = Permission.objects.create(
            module='cache-test',
            action='view',
            description='Cache test permission',
        )
        RolePermission.objects.create(role=role, permission=permission)
        UserRole.objects.create(user=self.tl, role=role, is_active=True)

        with patch('apps.permissions.services.permission_service.get_cache') as get_cache:
            get_cache.side_effect = RuntimeError('cache unavailable')
            self.assertTrue(permission_service.has_permission(self.tl, 'cache-test', 'view'))


class WorkspaceFilterMixinTests(TestCase):
    class DummyView(WorkspaceFilterMixin):
        def __init__(self, request):
            self.request = request

    def setUp(self):
        self.user = User.objects.create_user(username='ws-user', password='testpass')
        self.other_user = User.objects.create_user(username='ws-other', password='testpass')

        self.workspace = CalendarWorkspace.objects.create(name='Workspace A', code='ws-a')
        self.workspace.allowed_users.add(self.user)

        self.balance_in_scope = LeaveBalance.objects.create(
            user=self.user,
            leave_type='vacation',
            year=2026,
            total_days=10,
        )
        self.balance_out_of_scope = LeaveBalance.objects.create(
            user=self.other_user,
            leave_type='vacation',
            year=2026,
            total_days=5,
        )

    def _make_view(self, workspace_ids):
        request = SimpleNamespace(query_params={'workspace_ids': workspace_ids}, user=self.user)
        return self.DummyView(request)

    def test_apply_workspace_filter_limits_queryset(self):
        view = self._make_view(str(self.workspace.id))
        filtered = view._apply_workspace_filter(LeaveBalance.objects.all())
        self.assertQuerySetEqual(
            filtered.order_by('id'),
            LeaveBalance.objects.filter(id=self.balance_in_scope.id).order_by('id'),
        )

    def test_apply_workspace_filter_returns_empty_when_no_users(self):
        empty_workspace = CalendarWorkspace.objects.create(name='Workspace B', code='ws-b')
        view = self._make_view(str(empty_workspace.id))
        filtered = view._apply_workspace_filter(LeaveBalance.objects.all())
        self.assertEqual(filtered.count(), 0)

    def test_filter_for_team_leader_always_includes_self(self):
        tl = User.objects.create_user(username='ws-tl', password='testpass')
        member = User.objects.create_user(username='ws-member', password='testpass')
        team = Team.objects.create(name='WS Team', code='WST')
        TeamMembership.objects.create(user_profile=tl.profile, team=team, is_primary_team=True)
        TeamMembership.objects.create(user_profile=member.profile, team=team, is_primary_team=True)

        self_balance = LeaveBalance.objects.create(
            user=tl, leave_type='vacation', year=2026, total_days=8,
        )
        member_balance = LeaveBalance.objects.create(
            user=member, leave_type='vacation', year=2026, total_days=6,
        )

        request = SimpleNamespace(query_params={}, user=tl)
        view = self.DummyView(request)
        filtered = view.filter_for_team_leader(LeaveBalance.objects.all(), tl)
        ids = set(filtered.values_list('id', flat=True))
        self.assertIn(self_balance.id, ids)
        self.assertIn(member_balance.id, ids)

    def test_filter_team_leader_queryset_includes_led_teams_members(self):
        """team_logs / team_pending must resolve members via Team.team_leader."""
        leader = User.objects.create_user(username='qs-tl', password='testpass')
        member = User.objects.create_user(username='qs-member', password='testpass')
        team = Team.objects.create(name='QS Team', code='QST', team_leader=leader)
        TeamMembership.objects.create(user_profile=member.profile, team=team, is_primary_team=True)

        self_balance = LeaveBalance.objects.create(
            user=leader, leave_type='vacation', year=2026, total_days=4,
        )
        member_balance = LeaveBalance.objects.create(
            user=member, leave_type='vacation', year=2026, total_days=3,
        )

        request = SimpleNamespace(query_params={}, user=leader)
        view = self.DummyView(request)
        filtered = view._filter_team_leader_queryset(LeaveBalance.objects.all(), leader)
        ids = set(filtered.values_list('id', flat=True))
        self.assertIn(self_balance.id, ids)
        self.assertIn(member_balance.id, ids)


class MultiRoleHRPermissionTests(TestCase):
    """Regression: pure HR is view-only; multi-role HR+TL retains delete rights."""

    def setUp(self):
        self.client_obj = Client.objects.create(name='Acme', code='ACME')

        self.pure_hr = User.objects.create_user(username='pure-hr', password='testpass')
        self.pure_hr.profile.is_hr_user = True
        self.pure_hr.profile.save()

        self.tl_hr = User.objects.create_user(username='tl-hr', password='testpass')
        self.tl_hr.profile.is_hr_user = True
        self.tl_hr.profile.is_italian_tl_role = True
        self.tl_hr.profile.save()

        self.member = User.objects.create_user(username='hr-member', password='testpass')
        self.member.profile.italian_tl = self.tl_hr
        self.member.profile.save()

        self.own_log = OvertimeLog.objects.create(
            user=self.tl_hr,
            client=self.client_obj,
            date=date(2026, 3, 1),
            hours=Decimal('2.00'),
            description='own entry',
            status='pending',
        )
        self.member_log = OvertimeLog.objects.create(
            user=self.member,
            client=self.client_obj,
            date=date(2026, 3, 2),
            hours=Decimal('1.50'),
            description='member entry',
            status='pending',
        )
        self.checker = DeletePermissionMixin()

    def test_is_hr_only_true_for_pure_hr(self):
        self.assertTrue(is_hr_only(self.pure_hr))

    def test_is_hr_only_false_for_tl_hr(self):
        self.assertFalse(is_hr_only(self.tl_hr))

    def test_pure_hr_cannot_delete_any_entry(self):
        self.assertFalse(self.checker._can_delete(self.pure_hr, self.own_log))
        self.assertFalse(self.checker._can_delete(self.pure_hr, self.member_log))

    def test_tl_hr_can_delete_own_entry(self):
        self.assertTrue(self.checker._can_delete(self.tl_hr, self.own_log))

    def test_tl_hr_can_delete_team_member_entry(self):
        self.assertTrue(self.checker._can_delete(self.tl_hr, self.member_log))

    def test_hr_readonly_mixin_exempts_tl_hr(self):
        mixin = HRReadOnlyMixin()
        self.assertFalse(mixin._is_hr_only(self.tl_hr))
        self.assertTrue(mixin._is_hr_only(self.pure_hr))


class LedTeamApprovePermissionTests(TestCase):
    """Regression: led_teams TLs must approve, not only FK-assigned TLs."""

    def setUp(self):
        self.client_obj = Client.objects.create(name='Led Co', code='LEDCO')
        self.leader = User.objects.create_user(username='approve-tl', password='testpass')
        self.member = User.objects.create_user(username='approve-member', password='testpass')
        self.outsider = User.objects.create_user(username='approve-out', password='testpass')
        team = Team.objects.create(name='Approve Team', code='APPR', team_leader=self.leader)
        # Leader is NOT a TeamMembership member and has no italian_tl/albanian_tl FKs.
        TeamMembership.objects.create(
            user_profile=self.member.profile, team=team, is_primary_team=True,
        )
        self.member_log = OvertimeLog.objects.create(
            user=self.member,
            client=self.client_obj,
            date=date(2026, 4, 1),
            hours=Decimal('3.00'),
            description='member pending',
            status='pending',
        )
        self.outsider_log = OvertimeLog.objects.create(
            user=self.outsider,
            client=self.client_obj,
            date=date(2026, 4, 2),
            hours=Decimal('1.00'),
            description='outsider pending',
            status='pending',
        )
        self.approver = ApprovalPermissionMixin()

    def test_led_team_tl_can_approve_member_entry(self):
        self.assertTrue(self.leader.profile.is_team_leader)
        self.assertTrue(permission_service.can_approve(self.leader, self.member_log))
        self.assertTrue(self.approver._can_approve(self.leader, self.member_log))

    def test_led_team_tl_cannot_approve_outsider_entry(self):
        self.assertFalse(permission_service.can_approve(self.leader, self.outsider_log))
        self.assertFalse(self.approver._can_approve(self.leader, self.outsider_log))

    def test_fk_tl_can_still_approve(self):
        fk_tl = User.objects.create_user(username='fk-tl', password='testpass')
        fk_tl.profile.is_italian_tl_role = True
        fk_tl.profile.save()
        self.member.profile.italian_tl = fk_tl
        self.member.profile.save()
        self.assertTrue(permission_service.can_approve(fk_tl, self.member_log))


class CrAdminRoleCacheRefreshTests(TestCase):
    """Regression: _set_cr_admin_role uses .update() which bypasses signals.
    The manual _refresh_role_cache call must keep role_codes in sync.
    """

    def setUp(self):
        from apps.permissions.models import Role
        # Ensure the cr_admin role exists (seeded by migration 0003).
        Role.objects.get_or_create(code='cr_admin', defaults={'name': 'CR Admin'})
        self.user = User.objects.create_user(username='cr-cache-test', password='testpass')

    def test_grant_cr_admin_refreshes_role_codes(self):
        from apps.users.services.user_creation import _set_cr_admin_role
        _set_cr_admin_role(self.user, active=True)
        self.user.profile.refresh_from_db()
        self.assertIn('cr_admin', self.user.profile.role_codes)

    def test_revoke_cr_admin_refreshes_role_codes(self):
        from apps.users.services.user_creation import _set_cr_admin_role
        _set_cr_admin_role(self.user, active=True)
        _set_cr_admin_role(self.user, active=False)
        self.user.profile.refresh_from_db()
        self.assertNotIn('cr_admin', self.user.profile.role_codes)


class JWTDualReadClaimsTests(TestCase):
    """Regression: JWT is_italian_tl_role / is_albanian_tl_role claims must
    reflect the dual-read property (role_codes first), not just raw flags.
    """

    def setUp(self):
        from apps.permissions.models import Role, UserRole
        Role.objects.get_or_create(code='italian_tl', defaults={'name': 'Italian TL'})
        self.user = User.objects.create_user(username='jwt-dual-read', password='testpass')
        # Assign DB role WITHOUT setting the legacy flag.
        role = Role.objects.get(code='italian_tl')
        UserRole.objects.create(user=self.user, role=role, is_active=True)

    def test_jwt_tl_claim_reflects_db_role_without_legacy_flag(self):
        from apps.users.serializers import CustomTokenObtainPairSerializer
        # Force refresh_from_db to pick up signal-updated role_codes.
        self.user.profile.refresh_from_db()
        token = CustomTokenObtainPairSerializer.get_token(self.user)
        self.assertTrue(token['is_italian_tl_role'])
        self.assertTrue(token['is_team_leader'])
