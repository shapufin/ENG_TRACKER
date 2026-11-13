"""Review follow-ups to the owner rule (2026-11-13): who counts as a leader, parity, approval.

A leader is someone who can hold a leader queue: active, and a leader by role, legacy flag,
link target or an ACTIVE team they lead. A demoted, deactivated or archived-team-only
approver is not one, so their decisions follow the employee's current leader instead of
being owned by someone who cannot read them.
"""
from datetime import date

from django.contrib.auth.models import User
from django.test import TestCase

from apps.overtime.models import Client, OvertimeLog
from apps.permissions.services.permission_service import permission_service
from apps.users.models import Team
from apps.users.services.leader_ownership import leader_user_ids, owned_by_leader_q


def _leader(username, *, line=True):
    user = User.objects.create_user(username=username, password='x')
    setattr(user.profile, 'is_albanian_tl_role' if line else 'is_italian_tl_role', True)
    user.profile.save()
    return user


class LeaderDefinitionTests(TestCase):
    def setUp(self):
        self.approver = _leader('fu_approver')
        self.current = _leader('fu_current')
        self.emp = User.objects.create_user(username='fu_emp', password='x')
        self.emp.profile.albanian_tl = self.current
        self.emp.profile.save()
        self.client_row = Client.objects.create(name='Fu', code='FU')
        self.row = OvertimeLog.objects.create(
            user=self.emp, client=self.client_row, date=date(2026, 3, 10), hours=2,
            status='approved', approved_by=self.approver,
        )

    def _owner_ids(self):
        leaders = leader_user_ids()
        return [
            u.id for u in (self.approver, self.current)
            if OvertimeLog.objects.filter(pk=self.row.pk).filter(owned_by_leader_q(u.id, leaders)).exists()
        ]

    def test_active_leader_owns_their_decision(self):
        self.assertEqual(self._owner_ids(), [self.approver.id])

    def test_demoted_approver_who_only_leads_an_archived_team_is_not_a_leader(self):
        team = Team.objects.create(name='Fu Old', code='FUO', team_leader=self.approver, is_active=False)
        self.approver.profile.is_albanian_tl_role = False
        self.approver.profile.save()
        self.assertNotIn(self.approver.id, leader_user_ids())
        self.assertEqual(self._owner_ids(), [self.current.id])
        self.assertTrue(team.pk)

    def test_deactivated_approver_follows_the_current_leader(self):
        self.approver.is_active = False
        self.approver.save()
        self.assertNotIn(self.approver.id, leader_user_ids())
        self.assertEqual(self._owner_ids(), [self.current.id])

    def test_approver_leading_an_active_team_is_still_a_leader(self):
        self.approver.profile.is_albanian_tl_role = False
        self.approver.profile.save()
        Team.objects.create(name='Fu Live', code='FUL', team_leader=self.approver, is_active=True)
        self.assertIn(self.approver.id, leader_user_ids())

    def test_queryset_form_agrees_with_python_form_for_a_non_leader_viewer(self):
        # A viewer outside the leader set owns nothing as a decider (Python twin parity).
        self.approver.is_active = False
        self.approver.save()
        leaders = leader_user_ids()
        self.assertFalse(
            OvertimeLog.objects.filter(pk=self.row.pk).filter(owned_by_leader_q(self.approver.id, leaders)).exists()
        )


class ApprovalFollowsOwnerTests(TestCase):
    def setUp(self):
        self.line = _leader('fa_line')
        self.manager = _leader('fa_manager', line=False)
        self.emp = User.objects.create_user(username='fa_emp', password='x')
        self.emp.profile.albanian_tl = self.line
        self.emp.profile.italian_tl = self.manager
        self.emp.profile.save()
        self.client_row = Client.objects.create(name='Fa', code='FA')
        self.row = OvertimeLog.objects.create(
            user=self.emp, client=self.client_row, date=date(2026, 3, 10), hours=2, status='pending',
        )

    def test_line_manager_can_approve_the_pending_row(self):
        self.assertTrue(permission_service.can_approve(self.line, self.row))

    def test_manager_cannot_approve_a_row_the_line_manager_owns(self):
        self.assertFalse(permission_service.can_approve(self.manager, self.row))

    def test_manager_still_approves_when_there_is_no_line_manager(self):
        self.emp.profile.albanian_tl = None
        self.emp.profile.save()
        self.assertTrue(permission_service.can_approve(self.manager, self.row))
