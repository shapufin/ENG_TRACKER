"""Team lifecycle plan, Phase 1: history must survive a team delete."""
from datetime import date

from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from apps.dashboard.models.calendar import CalendarWorkspace
from apps.users.models import (
    ApprovalPeriodBoundary, ApprovalPeriodClose, ApprovalPeriodCloseMember,
    Team, UserProfile,
)
from apps.users.models.core import TeamMembershipHistory
from plugins.analytics.models import AnalyticsMetric
from plugins.analytics.serializers import AnalyticsMetricSerializer
from plugins.analytics.signals import record_metric
from plugins.engagement.models import TLApprovalMetric
from plugins.engagement.serializers import TLApprovalMetricSerializer
from plugins.engagement.services import stale_snapshot_ids


class TeamDeleteKeepsHistoryTests(TestCase):
    def setUp(self):
        self.leader = User.objects.create_user('lead', password='x')
        UserProfile.objects.get_or_create(user=self.leader)
        self.member = User.objects.create_user('mem', password='x')
        UserProfile.objects.get_or_create(user=self.member)
        self.team = Team.objects.create(name='Alpha', code='ALP', team_leader=self.leader)
        self.month = date(2026, 9, 1)

    def _metric(self, team=None, leader=None):
        return TLApprovalMetric.objects.create(
            leader=leader or self.leader, team=team or self.team, month=self.month,
            team_name=(team or self.team).name, team_code=(team or self.team).code,
            computed_at=timezone.now(),
        )

    def test_engagement_metric_survives_with_labels(self):
        metric = self._metric()
        self.team.name = 'Alpha Renamed'  # a rename after the snapshot must not leave a stale label
        self.team.save()
        self.team.delete()
        metric.refresh_from_db()
        self.assertIsNone(metric.team_id)
        self.assertEqual(metric.team_name, 'Alpha Renamed')
        self.assertEqual(metric.team_code, 'ALP')
        self.assertIn('Alpha Renamed', str(metric))
        self.assertEqual(TLApprovalMetricSerializer(metric).data['team_name'], 'Alpha Renamed')

    def test_orphan_rows_are_never_stale_and_do_not_crash(self):
        metric = self._metric()
        self.team.delete()
        metric.refresh_from_db()
        self.assertEqual(stale_snapshot_ids([metric]), set())

    def test_null_team_rows_for_same_leader_month_are_allowed(self):
        other = Team.objects.create(name='Beta', code='BET', team_leader=self.leader)
        self._metric()
        self._metric(team=other)
        self.team.delete()
        other.delete()
        self.assertEqual(
            TLApprovalMetric.objects.filter(leader=self.leader, month=self.month, team__isnull=True).count(), 2
        )

    def test_unique_per_team_still_enforced(self):
        self._metric()
        with self.assertRaises(IntegrityError), transaction.atomic():
            self._metric()

    def test_analytics_metric_survives_with_label(self):
        record_metric('team_performance', 5, team=self.team)
        metric = AnalyticsMetric.objects.get()
        self.assertEqual(metric.team_name, 'Alpha')
        self.team.delete()
        metric.refresh_from_db()
        self.assertIsNone(metric.team_id)
        self.assertEqual(AnalyticsMetricSerializer(metric).data['team_name'], 'Alpha')

    def test_close_member_keeps_source_team_label(self):
        boundary = ApprovalPeriodBoundary.objects.create(period=self.month)
        close = ApprovalPeriodClose.objects.create(
            boundary=boundary, closed_at=timezone.now(), scope_key='k'
        )
        row = ApprovalPeriodCloseMember.objects.create(
            close=close, user=self.member, source_team=self.team,
            source_team_name='Alpha', source_team_code='ALP',
        )
        self.team.delete()
        row.refresh_from_db()
        self.assertIsNone(row.source_team_id)
        self.assertEqual((row.source_team_name, row.source_team_code), ('Alpha', 'ALP'))

    def test_calendar_workspace_detached_at_defaults_to_null_and_is_stamped_on_delete(self):
        workspace = CalendarWorkspace.objects.get(team=self.team)
        self.assertIsNone(workspace.detached_at)
        from apps.dashboard.models.calendar import PublicHoliday
        PublicHoliday.objects.create(calendar=workspace, name='H', date=date(2026, 12, 25), is_global=False)
        self.team.delete()
        workspace.refresh_from_db()
        self.assertIsNone(workspace.team_id)
        self.assertIsNotNone(workspace.detached_at)

    def test_membership_history_survives_team_delete(self):
        row = TeamMembershipHistory.objects.create(
            team=self.team, team_name='Alpha', team_code='ALP', user=self.member,
            username='mem', removed_at=timezone.now(), reason='test',
        )
        self.team.delete()
        row.refresh_from_db()
        self.assertIsNone(row.team_id)
        self.assertEqual((row.team_name, row.team_code, row.username), ('Alpha', 'ALP', 'mem'))
