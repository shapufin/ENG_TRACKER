"""
Tests for the TL Engagement Metrics plugin.

Uses APIRequestFactory + direct viewset calls (pattern shared with
control_room/ticket_kpi tests) so permission seeding stays explicit.
"""
from datetime import date, timedelta

from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.leave_management.models.core import LeaveRequest
from apps.overtime.models.core import OvertimeLog, Client
from apps.permissions.models import Role, UserRole
from apps.users.models.core import Team, TeamMembership, UserProfile

from plugins.engagement.models import TLApprovalMetric
from plugins.engagement.services import compute_tl_metric, percentile, is_stale, weighted_mean
from plugins.engagement.viewsets import TLEngagementMetricsViewSet


def _make_user(username, **kwargs):
    user = User.objects.create_user(username=username, password='testpass123', **kwargs)
    UserProfile.objects.get_or_create(user=user)
    return user


def _make_team(name, code, leader=None):
    return Team.objects.create(name=name, code=code, team_leader=leader)


def _assign_tl_role(user, code='italian_tl'):
    role, _ = Role.objects.get_or_create(code=code, defaults={'name': code})
    UserRole.objects.get_or_create(user=user, role=role, defaults={'is_active': True})


def _make_client():
    return Client.objects.create(name='Acme', code='ACME')


def _make_overtime(user, day, submitted_at, hours=4, status='pending', approved_at=None, client=None,
                    approved_by=None):
    log = OvertimeLog.objects.create(
        user=user,
        client=client,
        date=day,
        hours=hours,
        status=status,
        approved_at=approved_at,
        approved_by=approved_by,
    )
    OvertimeLog.objects.filter(pk=log.pk).update(submitted_at=submitted_at)
    log.refresh_from_db()
    return log


class EngagementServiceTests(TestCase):
    """Unit tests for the pure compute helpers."""

    def test_speed_score_gives_overtime_standby_a_week_long_target(self):
        from plugins.engagement.services import compute_engagement_score

        type_metrics = {
            'leave': {'decided': 1, 'approved': 1, 'p90_tta_hours': 5 * 24},
            'overtime': {'decided': 1, 'approved': 1, 'p90_tta_hours': 5 * 24},
            'standby': {'decided': 0, 'approved': 0, 'p90_tta_hours': None},
        }
        _, sub_scores = compute_engagement_score(
            type_metrics, [5 * 24, 5 * 24], team_size=2, active_submitters=2,
        )
        # Leave decided in 5 days is past its 72h ceiling -> 0.
        # Overtime decided in 5 days is still inside its 7-day target -> 100.
        # score_speed is the decided-weighted mean of the two: (0 + 100) / 2.
        self.assertEqual(sub_scores['score_speed'], 50.0)

    def test_weighted_mean_zero_weight_row_does_not_inflate_result(self):
        # A team_size=0 row alongside a team_size=10 row must not skew the
        # mean toward the zero-weight row's value — its weight normalizes to
        # 1 in BOTH the numerator and the denominator, not just the former.
        result = weighted_mean([(100, 0), (0, 10)])
        # Correct: (100*1 + 0*10) / (1 + 10) = 100/11 ~= 9.09
        # Buggy (pre-fix): (100*1 + 0*10) / (0 + 10) = 100/10 = 10.0
        self.assertAlmostEqual(result, 9.09, places=2)

    def test_median_p90_known_values(self):
        values = sorted([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
        self.assertEqual(percentile(values, 0.50), 6)
        self.assertEqual(percentile(values, 0.90), 10)

    def setUp(self):
        self.client_obj = _make_client()
        self.leader = _make_user('leader1')
        self.team = _make_team('Team A', 'TA', leader=self.leader)
        self.member = _make_user('member1')
        TeamMembership.objects.create(user_profile=self.member.profile, team=self.team)
        self.month = date.today().replace(day=1)
        self.month_start = timezone.make_aware(
            timezone.datetime(self.month.year, self.month.month, 15)
        )

    def test_aging_buckets_and_stale_pending(self):
        # Decided within each bucket.
        _make_overtime(
            self.member, self.month, self.month_start, status='approved',
            approved_at=self.month_start + timedelta(hours=2), client=self.client_obj,
        )
        _make_overtime(
            self.member, self.month, self.month_start, status='approved',
            approved_at=self.month_start + timedelta(hours=10), client=self.client_obj,
        )
        _make_overtime(
            self.member, self.month, self.month_start, status='approved',
            approved_at=self.month_start + timedelta(hours=48), client=self.client_obj,
        )
        _make_overtime(
            self.member, self.month, self.month_start, status='approved',
            approved_at=self.month_start + timedelta(hours=100), client=self.client_obj,
        )
        # Pending, submitted over 48h ago.
        _make_overtime(
            self.member, self.month, timezone.now() - timedelta(hours=72),
            status='pending', client=self.client_obj,
        )

        snapshot = compute_tl_metric(self.leader, self.team, self.month)
        aging = snapshot.metrics['overtime']['aging']
        self.assertEqual(aging['<4h'], 1)
        self.assertEqual(aging['4-24h'], 1)
        self.assertEqual(aging['1-3d'], 1)
        self.assertEqual(aging['>3d'], 1)
        self.assertEqual(snapshot.metrics['overtime']['pending_over_48h'], 1)

    def test_resubmission_after_rejection(self):
        rejected_at = self.month_start
        _make_overtime(
            self.member, self.month, rejected_at, status='rejected',
            approved_at=rejected_at + timedelta(hours=1), client=self.client_obj,
        )
        # Resubmission: same date, later submitted_at, within 30 days.
        _make_overtime(
            self.member, self.month, rejected_at + timedelta(days=2),
            status='approved', approved_at=rejected_at + timedelta(days=2, hours=1),
            client=self.client_obj,
        )

        snapshot = compute_tl_metric(self.leader, self.team, self.month)
        self.assertEqual(snapshot.metrics['overtime']['resubmission_count'], 1)

        # A different date must not count as a resubmission.
        TLApprovalMetric.objects.all().delete()
        OvertimeLog.objects.all().delete()
        _make_overtime(
            self.member, self.month, rejected_at, status='rejected',
            approved_at=rejected_at + timedelta(hours=1), client=self.client_obj,
        )
        other_day = self.month + timedelta(days=5)
        _make_overtime(
            self.member, other_day, rejected_at + timedelta(days=2),
            status='approved', approved_at=rejected_at + timedelta(days=2, hours=1),
            client=self.client_obj,
        )
        snapshot = compute_tl_metric(self.leader, self.team, self.month)
        self.assertEqual(snapshot.metrics['overtime']['resubmission_count'], 0)

    def test_resubmission_counted_once_per_rejection_chain(self):
        """Two rejections for the same date resolved by one final approval count as one resubmission."""
        first_rejection = self.month_start
        second_rejection = first_rejection + timedelta(days=1)
        final_approval_submit = first_rejection + timedelta(days=2)
        _make_overtime(
            self.member, self.month, first_rejection, status='rejected',
            approved_at=first_rejection + timedelta(hours=1), client=self.client_obj,
        )
        _make_overtime(
            self.member, self.month, second_rejection, status='rejected',
            approved_at=second_rejection + timedelta(hours=1), client=self.client_obj,
        )
        _make_overtime(
            self.member, self.month, final_approval_submit, status='approved',
            approved_at=final_approval_submit + timedelta(hours=1), client=self.client_obj,
        )

        snapshot = compute_tl_metric(self.leader, self.team, self.month)
        self.assertEqual(snapshot.metrics['overtime']['resubmission_count'], 1)

    def test_freshness_stale_flag(self):
        snapshot = compute_tl_metric(self.leader, self.team, self.month)
        self.assertFalse(is_stale(snapshot))

        _make_overtime(self.member, self.month, timezone.now(), status='pending', client=self.client_obj)
        self.assertTrue(is_stale(snapshot))

    def test_decisions_during_leave_counted_only_inside_leaders_own_leave(self):
        LeaveRequest.objects.create(
            user=self.leader,
            request_type='vacation',
            start_date=self.month,
            end_date=self.month_start.date(),
            status='approved',
        )
        # Decided by the leader while the leader is on leave -> counts.
        _make_overtime(
            self.member, self.month, self.month_start, status='approved',
            approved_at=self.month_start + timedelta(hours=1), client=self.client_obj,
            approved_by=self.leader,
        )
        # Decided by the leader well after the leave window -> does not count.
        _make_overtime(
            self.member, self.month, self.month_start, status='approved',
            approved_at=self.month_start + timedelta(days=20), client=self.client_obj,
            approved_by=self.leader,
        )

        snapshot = compute_tl_metric(self.leader, self.team, self.month)
        self.assertEqual(snapshot.decisions_during_leave, 1)

    def test_decisions_during_leave_not_double_counted_across_month_boundary(self):
        from calendar import monthrange

        last_day = self.month.replace(day=monthrange(self.month.year, self.month.month)[1])
        next_month_first = last_day + timedelta(days=1)

        # Leave spans the month boundary: last day of this month through
        # first day of next month.
        LeaveRequest.objects.create(
            user=self.leader,
            request_type='vacation',
            start_date=last_day,
            end_date=next_month_first,
            status='approved',
        )

        decided_this_month = timezone.make_aware(
            timezone.datetime(last_day.year, last_day.month, last_day.day, 10)
        )
        decided_next_month = timezone.make_aware(
            timezone.datetime(next_month_first.year, next_month_first.month, next_month_first.day, 10)
        )
        _make_overtime(
            self.member, self.month, decided_this_month, status='approved',
            approved_at=decided_this_month, client=self.client_obj, approved_by=self.leader,
        )
        _make_overtime(
            self.member, self.month, decided_next_month, status='approved',
            approved_at=decided_next_month, client=self.client_obj, approved_by=self.leader,
        )

        this_month_snapshot = compute_tl_metric(self.leader, self.team, self.month)
        next_month_snapshot = compute_tl_metric(self.leader, self.team, next_month_first)

        # Each month's snapshot only credits the decision made during its
        # own slice of the leave — not both, and not neither.
        self.assertEqual(this_month_snapshot.decisions_during_leave, 1)
        self.assertEqual(next_month_snapshot.decisions_during_leave, 1)

    def test_decisions_during_leave_zero_without_leave(self):
        _make_overtime(
            self.member, self.month, self.month_start, status='approved',
            approved_at=self.month_start + timedelta(hours=1), client=self.client_obj,
            approved_by=self.leader,
        )
        snapshot = compute_tl_metric(self.leader, self.team, self.month)
        self.assertEqual(snapshot.decisions_during_leave, 0)

    def test_recompute_command_idempotent(self):
        _make_overtime(
            self.member, self.month, self.month_start, status='approved',
            approved_at=self.month_start + timedelta(hours=2), client=self.client_obj,
        )
        call_command('recompute_tl_metrics', month=self.month.isoformat())
        call_command('recompute_tl_metrics', month=self.month.isoformat())
        self.assertEqual(
            TLApprovalMetric.objects.filter(leader=self.leader, team=self.team, month=self.month).count(),
            1,
        )


class EngagementAPITests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.client_obj = _make_client()

        self.leader = _make_user('leader2')
        _assign_tl_role(self.leader, 'italian_tl')
        self.team = _make_team('Team B', 'TB', leader=self.leader)
        self.member = _make_user('member2')
        TeamMembership.objects.create(user_profile=self.member.profile, team=self.team)

        self.other_leader = _make_user('leader3')
        _assign_tl_role(self.other_leader, 'albanian_tl')
        self.other_team = _make_team('Team C', 'TC', leader=self.other_leader)
        self.other_member = _make_user('member3')
        TeamMembership.objects.create(user_profile=self.other_member.profile, team=self.other_team)

        self.employee = _make_user('employee1')
        self.staff = _make_user('staff1', is_staff=True)

        self.month = date.today().replace(day=1)
        call_command('seed_plugin_permissions')

        compute_tl_metric(self.leader, self.team, self.month)
        compute_tl_metric(self.other_leader, self.other_team, self.month)

    def _call(self, action_name, user, **params):
        url = f'/api/plugins/engagement/metrics/{action_name}/'
        request = self.factory.get(url, params)
        force_authenticate(request, user=user)
        return TLEngagementMetricsViewSet.as_view({'get': action_name.replace('-', '_')})(request)

    def test_summary_requires_tl(self):
        resp = self._call('summary', self.employee)
        self.assertEqual(resp.status_code, 403)

        resp = self._call('summary', self.leader)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['team_count'], 1)

    def test_trend_and_team_breakdown_scoping(self):
        resp = self._call('team-breakdown', self.leader, month=self.month.isoformat())
        self.assertEqual(resp.status_code, 200)
        team_names = {row['team_name'] for row in resp.data}
        self.assertEqual(team_names, {'Team B'})

        resp = self._call('team-breakdown', self.other_leader, month=self.month.isoformat())
        self.assertEqual(resp.status_code, 200)
        team_names = {row['team_name'] for row in resp.data}
        self.assertEqual(team_names, {'Team C'})

        resp = self._call('team-breakdown', self.staff, month=self.month.isoformat())
        self.assertEqual(resp.status_code, 200)
        team_names = {row['team_name'] for row in resp.data}
        self.assertEqual(team_names, {'Team B', 'Team C'})

        resp = self._call('trend', self.leader)
        self.assertEqual(resp.status_code, 200)

    def test_trend_includes_sub_scores(self):
        resp = self._call('trend', self.leader)
        self.assertEqual(resp.status_code, 200)
        point = next(p for p in resp.data if p['month'] == self.month.isoformat())
        row = TLApprovalMetric.objects.get(leader=self.leader, team=self.team, month=self.month)
        self.assertEqual(point['score_speed'], row.score_speed)
        self.assertEqual(point['score_approval_rate'], row.score_approval_rate)
        self.assertEqual(point['score_activity'], row.score_activity)
        self.assertEqual(point['score_consistency'], row.score_consistency)

    def test_export_requires_tl_and_month(self):
        resp = self._call('export', self.employee, month=self.month.isoformat())
        self.assertEqual(resp.status_code, 403)

        resp = self._call('export', self.leader)
        self.assertEqual(resp.status_code, 400)

    def test_export_month_scope_returns_workbook(self):
        resp = self._call('export', self.leader, month=self.month.isoformat(), scope='month')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            resp['Content-Type'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        self.assertIn('attachment', resp['Content-Disposition'])

    def test_export_year_scope_returns_workbook(self):
        resp = self._call('export', self.leader, month=self.month.isoformat(), scope='year')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            resp['Content-Type'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
