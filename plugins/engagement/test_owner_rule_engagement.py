"""Engagement follows the owner rule for overtime and standby (Option A, 2026-11-13).

A decision is credited to the leader who made it, even after the employee moves. Each
overtime or standby row is counted in exactly one of the leader's team snapshots, so a
leader's totals never double count an employee who sits in two teams.
"""
from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone

from apps.overtime.models import Client, OvertimeLog
from apps.permissions.models import Role, UserRole
from apps.users.models import Team
from apps.users.services.team_membership import change_user_teams
from plugins.engagement.services import compute_tl_metric


def _lm(username):
    user = User.objects.create_user(username=username, password='x')
    user.profile.is_albanian_tl_role = True
    user.profile.save()
    role, _ = Role.objects.get_or_create(code='albanian_tl', defaults={'name': 'albanian_tl'})
    UserRole.objects.get_or_create(user=user, role=role, defaults={'is_active': True})
    return user


class EngagementOwnerRuleTests(TestCase):
    def setUp(self):
        self.now = timezone.now()
        self.month = self.now.date().replace(day=1)
        self.client_row = Client.objects.create(name='Eng', code='ENG')
        self.old_lm = _lm('eng_old_lm')
        self.new_lm = _lm('eng_new_lm')
        self.team_a = Team.objects.create(name='Eng A', code='EA')
        self.team_b = Team.objects.create(name='Eng B', code='EB')
        change_user_teams(self.old_lm.profile, [self.team_b.id])
        self.emp = User.objects.create_user(username='eng_emp', password='x')
        self.emp.profile.albanian_tl = self.old_lm
        self.emp.profile.save()
        change_user_teams(self.emp.profile, [self.team_a.id])

    def _decided_by_old_lm(self):
        log = OvertimeLog.objects.create(
            user=self.emp, client=self.client_row, date=self.now.date(), hours=2,
            status='approved', approved_by=self.old_lm,
        )
        OvertimeLog.objects.filter(pk=log.pk).update(submitted_at=self.now, approved_at=self.now)

    def _decided(self, leader, team):
        return compute_tl_metric(leader, team, self.month).metrics['overtime']['decided']

    def _decided_total(self, leader):
        return sum(self._decided(leader, team) for team in (self.team_a, self.team_b))

    def test_decision_stays_with_the_approver_after_a_move(self):
        self._decided_by_old_lm()
        self.emp.profile.albanian_tl = self.new_lm
        self.emp.profile.save()
        self.assertEqual(self._decided_total(self.old_lm), 1)
        self.assertEqual(self._decided_total(self.new_lm), 0)

    def test_decision_is_counted_once_across_two_teams_of_one_leader(self):
        change_user_teams(self.emp.profile, [self.team_a.id, self.team_b.id])
        self._decided_by_old_lm()
        total = self._decided(self.old_lm, self.team_a) + self._decided(self.old_lm, self.team_b)
        self.assertEqual(total, 1)

    def test_a_leader_with_no_team_still_gets_a_snapshot_for_the_employee_team(self):
        from plugins.engagement.services import leader_team_pairs

        change_user_teams(self.old_lm.profile, [])
        self._decided_by_old_lm()
        self.emp.profile.albanian_tl = self.new_lm
        self.emp.profile.save()
        pairs = {(leader.id, team.id) for leader, team in leader_team_pairs([self.old_lm.id])}
        self.assertIn((self.old_lm.id, self.team_a.id), pairs)
        self.assertEqual(self._decided(self.old_lm, self.team_a), 1)

    def test_a_leader_with_no_members_still_sees_the_team_row_with_their_decision(self):
        from django.core.management import call_command
        from rest_framework.test import APIRequestFactory, force_authenticate

        from plugins.engagement.viewsets import TLEngagementMetricsViewSet

        call_command('seed_plugin_permissions', verbosity=0)
        change_user_teams(self.old_lm.profile, [])
        self._decided_by_old_lm()
        self.emp.profile.albanian_tl = self.new_lm
        self.emp.profile.save()
        self._decided(self.old_lm, self.team_a)  # compute the snapshot the page reads
        request = APIRequestFactory().get(
            '/api/plugins/engagement/metrics/team-breakdown/', {'month': self.month.isoformat()},
        )
        force_authenticate(request, user=self.old_lm)
        response = TLEngagementMetricsViewSet.as_view({'get': 'team_breakdown'})(request)
        self.assertEqual(response.status_code, 200, response.data)
        rows = response.data if isinstance(response.data, list) else response.data.get('results', [])
        self.assertIn(self.team_a.code, [row.get('team_code') or row.get('team_name') for row in rows])

    def test_a_late_decision_by_a_leader_marks_their_snapshot_stale(self):
        from datetime import timedelta

        from plugins.engagement.services import is_stale

        self._decided_by_old_lm()
        self.emp.profile.albanian_tl = self.new_lm
        self.emp.profile.save()
        change_user_teams(self.emp.profile, [self.team_b.id])
        snapshot = compute_tl_metric(self.old_lm, self.team_a, self.month)
        self.assertFalse(is_stale(snapshot))
        late = OvertimeLog.objects.create(
            user=self.emp, client=self.client_row, date=self.now.date(), hours=1,
            status='pending',
        )
        OvertimeLog.objects.filter(pk=late.pk).update(
            status='rejected', approved_by=self.old_lm, approved_at=self.now,
            rejection_reason='late', updated_at=self.now + timedelta(minutes=5),
        )
        self.assertTrue(is_stale(snapshot))
