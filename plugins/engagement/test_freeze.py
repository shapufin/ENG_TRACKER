"""Team lifecycle plan, Phase 5: a month's engagement snapshot is final once computed after the freeze."""
from datetime import date, datetime
from io import StringIO
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import TestCase

from apps.users.models import Team, UserProfile
from plugins.engagement.models import TLApprovalMetric
from plugins.engagement.serializers import TLApprovalMetricSerializer
from plugins.engagement.services import (
    candidate_leader_ids, compute_tl_metric, finalize_frozen_snapshots, leader_team_pairs, stale_snapshot_ids,
)

TIRANE = ZoneInfo('Europe/Tirane')
MONTH = date(2026, 9, 1)  # freezes at 2026-10-10 00:00 Europe/Tirane
BEFORE = datetime(2026, 10, 5, 12, tzinfo=TIRANE)
AFTER = datetime(2026, 10, 12, 12, tzinfo=TIRANE)
PROVISIONAL_AUG = datetime(2026, 9, 5, tzinfo=TIRANE)  # August freezes on 2026-09-10


def make_user(name):
    user = User.objects.create_user(name, password='x')
    UserProfile.objects.get_or_create(user=user)
    return user


class FreezeBase(TestCase):
    def setUp(self):
        patcher = patch('core.utils.metrics_freeze.business_tz', return_value=TIRANE)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.leader = make_user('lead')
        self.team = Team.objects.create(name='Alpha', code='ALP', team_leader=self.leader)
        self.m1, self.m2 = make_user('m1'), make_user('m2')
        for member in (self.m1, self.m2):
            member.profile.teams.add(self.team)

    def compute_at(self, moment):
        with patch('plugins.engagement.services._now', return_value=moment), \
                patch('django.utils.timezone.now', return_value=moment):
            return compute_tl_metric(self.leader, self.team, MONTH)

    def stale_at(self, row, moment):
        with patch('plugins.engagement.services._now', return_value=moment), \
                patch('django.utils.timezone.now', return_value=moment):
            return stale_snapshot_ids([row])


class FreezeRuleTests(FreezeBase):
    def test_before_the_freeze_membership_changes_still_recompute(self):
        row = self.compute_at(BEFORE)
        self.assertEqual(self.stale_at(row, BEFORE), set())
        self.m2.profile.teams.clear()
        self.assertEqual(self.stale_at(row, BEFORE), {row.pk})

    def test_a_row_computed_before_the_freeze_gets_one_final_recompute(self):
        row = self.compute_at(BEFORE)
        self.assertEqual(self.stale_at(row, AFTER), {row.pk})  # provisional, even though nothing changed
        final = self.compute_at(AFTER)
        self.assertEqual(final.pk, row.pk)
        self.assertEqual(self.stale_at(final, AFTER), set())

    def test_a_final_row_ignores_later_membership_changes(self):
        final = self.compute_at(AFTER)
        self.assertEqual(final.team_size, 2)
        self.m2.profile.teams.clear()
        self.assertEqual(self.stale_at(final, AFTER), set())

    def test_a_never_computed_or_old_shape_row_is_still_recomputed(self):
        row = TLApprovalMetric.objects.create(leader=self.leader, team=self.team, month=MONTH)
        self.assertEqual(self.stale_at(row, AFTER), {row.pk})
        old_shape = self.compute_at(AFTER)
        old_shape.metrics = {'leave': {}}
        old_shape.save()
        self.assertEqual(self.stale_at(old_shape, AFTER), {old_shape.pk})

    def test_serializer_reports_frozen(self):
        final = self.compute_at(AFTER)
        early = TLApprovalMetric.objects.create(
            leader=self.leader, team=self.team, month=date(2026, 8, 1), computed_at=PROVISIONAL_AUG,
        )
        with patch('django.utils.timezone.now', return_value=AFTER):
            self.assertTrue(TLApprovalMetricSerializer(final).data['frozen'])
            self.assertFalse(TLApprovalMetricSerializer(early).data['frozen'])


class FinalizeCommandTests(FreezeBase):
    def test_finalizes_only_rows_that_are_past_the_freeze_and_not_final(self):
        provisional = self.compute_at(BEFORE)
        final = self.compute_at(AFTER)
        other_month = TLApprovalMetric.objects.create(
            leader=self.leader, team=self.team, month=date(2026, 8, 1), computed_at=PROVISIONAL_AUG, team_size=2,
        )
        orphan = TLApprovalMetric.objects.create(leader=self.leader, team=None, month=date(2026, 7, 1))
        self.assertEqual(final.pk, provisional.pk)  # same (leader, team, month) row
        with patch('plugins.engagement.services._now', return_value=AFTER), \
                patch('django.utils.timezone.now', return_value=AFTER):
            dry = finalize_frozen_snapshots(dry_run=True)
            self.assertEqual(dry, 1)  # only August; September is already final, the orphan is history
            self.assertEqual(finalize_frozen_snapshots(), 1)
            self.assertEqual(finalize_frozen_snapshots(), 0)
        other_month.refresh_from_db()
        self.assertGreaterEqual(other_month.computed_at, AFTER)
        orphan.refresh_from_db()
        self.assertIsNone(orphan.computed_at)

    def test_management_command_runs(self):
        out = StringIO()
        call_command('finalize_frozen_metrics', stdout=out)
        self.assertIn('Finalized', out.getvalue())

    def test_recompute_command_skips_frozen_months_unless_asked(self):
        final = self.compute_at(AFTER)
        self.m2.profile.teams.clear()
        with patch('plugins.engagement.services._now', return_value=AFTER), \
                patch('django.utils.timezone.now', return_value=AFTER):
            call_command('recompute_tl_metrics', month='2026-09-01', stdout=StringIO())
            final.refresh_from_db()
            self.assertEqual(final.team_size, 2)
            call_command('recompute_tl_metrics', month='2026-09-01', include_frozen=True, stdout=StringIO())
            final.refresh_from_db()
            self.assertEqual(final.team_size, 1)


class ArchivedTeamPairsTests(FreezeBase):
    def test_archived_team_is_not_paired_and_its_leader_is_not_a_candidate(self):
        self.assertIn((self.leader.pk, self.team.pk), [(lead.pk, t.pk) for lead, t in leader_team_pairs()])
        self.m1.profile.teams.clear()
        self.m2.profile.teams.clear()
        Team.objects.filter(pk=self.team.pk).update(is_active=False)
        self.assertNotIn(self.team.pk, [t.pk for _, t in leader_team_pairs()])
        self.assertNotIn(self.leader.pk, candidate_leader_ids())


class SummaryFrozenTests(FreezeBase):
    def test_summary_is_frozen_only_when_every_row_is_final(self):
        from plugins.engagement.viewsets import TLEngagementMetricsViewSet

        final = self.compute_at(AFTER)
        provisional = TLApprovalMetric(
            leader=self.leader, team=self.team, month=MONTH, computed_at=BEFORE,
        )
        with patch('django.utils.timezone.now', return_value=AFTER):
            summary = TLEngagementMetricsViewSet._summary_payload
            self.assertTrue(summary([final], False, MONTH)['frozen'])
            self.assertFalse(summary([final, provisional], False, MONTH)['frozen'])
            self.assertFalse(summary([], False, MONTH)['frozen'])

