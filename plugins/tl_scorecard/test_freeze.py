"""Team lifecycle plan, Phase 5: a past month's scorecard metrics are frozen by a job, not on read."""
from datetime import date, datetime
from io import StringIO
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import TestCase

from apps.users.models import Team, UserProfile
from plugins.tl_scorecard.models import ScorecardMonthSnapshot
from plugins.tl_scorecard.services import build_scorecard, scorecard_trend
from plugins.tl_scorecard.snapshots import freeze_scorecard_months, target_month

TIRANE = ZoneInfo('Europe/Tirane')
SEPT = date(2026, 9, 1)  # freezes 2026-10-10 00:00 Europe/Tirane
BEFORE = datetime(2026, 10, 5, 12, tzinfo=TIRANE)
AFTER = datetime(2026, 10, 12, 12, tzinfo=TIRANE)


def make_user(name):
    user = User.objects.create_user(name, password='x')
    UserProfile.objects.get_or_create(user=user)
    return user


class ScorecardFreezeTests(TestCase):
    def setUp(self):
        for target in ('core.utils.metrics_freeze.business_tz', 'plugins.tl_scorecard.snapshots.business_tz'):
            patcher = patch(target, return_value=TIRANE)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.leader = make_user('lead')
        self.team = Team.objects.create(name='Alpha', code='ALP', team_leader=self.leader)
        self.m1, self.m2 = make_user('m1'), make_user('m2')
        for member in (self.m1, self.m2):
            member.profile.teams.add(self.team)

    def at(self, moment):
        # fresh user object each time: scoreable_member_ids caches on the profile
        user = User.objects.select_related('profile').get(pk=self.leader.pk)
        patchers = [
            patch('django.utils.timezone.now', return_value=moment),
            patch('plugins.tl_scorecard.services.business_today', return_value=moment.date()),
        ]
        for p in patchers:
            p.start()
            self.addCleanup(p.stop)
        return user

    def test_target_month_is_the_latest_month_whose_freeze_has_passed(self):
        self.assertEqual(target_month(datetime(2026, 10, 12, tzinfo=TIRANE)), SEPT)
        self.assertEqual(target_month(datetime(2026, 10, 5, tzinfo=TIRANE)), date(2026, 8, 1))
        self.assertEqual(target_month(datetime(2027, 1, 20, tzinfo=TIRANE)), date(2026, 12, 1))

    def test_job_snapshots_each_leader_once_and_skips_leaders_without_members(self):
        lonely = make_user('lonely')
        Team.objects.create(name='Empty', code='EMP', team_leader=lonely)
        self.assertEqual(freeze_scorecard_months(now=AFTER), 1)
        snap = ScorecardMonthSnapshot.objects.get()
        self.assertEqual((snap.leader_id, snap.month), (self.leader.pk, SEPT))
        self.assertEqual(sorted(snap.member_ids), sorted([self.m1.pk, self.m2.pk]))
        self.assertGreaterEqual(snap.computed_at, AFTER)
        self.assertEqual(freeze_scorecard_months(now=AFTER), 0)  # month already done: cheap no-op

    def test_a_frozen_month_ignores_later_membership_changes_but_other_months_stay_live(self):
        freeze_scorecard_months(now=AFTER)
        self.m2.profile.teams.clear()
        user = self.at(AFTER)
        self.assertEqual(build_scorecard(user, SEPT)['team_size'], 2)
        self.assertTrue(build_scorecard(user, SEPT)['frozen'])
        october = build_scorecard(user, date(2026, 10, 1))
        self.assertEqual(october['team_size'], 1)
        self.assertFalse(october['frozen'])

    def test_a_month_without_a_snapshot_is_computed_live(self):
        user = self.at(AFTER)
        payload = build_scorecard(user, SEPT)
        self.assertEqual(payload['team_size'], 2)
        self.assertFalse(payload['frozen'])
        self.m2.profile.teams.clear()
        self.assertEqual(build_scorecard(User.objects.select_related('profile').get(pk=self.leader.pk), SEPT)['team_size'], 1)

    def test_a_snapshot_written_before_the_freeze_is_not_trusted(self):
        ScorecardMonthSnapshot.objects.create(
            leader=self.leader, month=SEPT, member_ids=[self.m1.pk], computed_at=BEFORE,
            payload={'team_size': 99, 'leave': {}, 'overtime': {}, 'meetings': {}},
        )
        self.assertEqual(build_scorecard(self.at(AFTER), SEPT)['team_size'], 2)

    def test_reading_never_writes_a_snapshot(self):
        build_scorecard(self.at(AFTER), SEPT)
        self.assertEqual(ScorecardMonthSnapshot.objects.count(), 0)

    def test_year_and_current_state_blocks_stay_live(self):
        freeze_scorecard_months(now=AFTER)
        payload = build_scorecard(self.at(AFTER), SEPT)
        for key in ('idle', 'pip', 'promotion', 'review_deliveries_ytd'):
            self.assertIn(key, payload)

    def test_mutating_a_returned_payload_does_not_change_the_snapshot(self):
        freeze_scorecard_months(now=AFTER)
        user = self.at(AFTER)
        first = build_scorecard(user, SEPT)
        first['meetings']['one_on_one_compliance_pct'] = None  # what the HBPR mask does
        again = build_scorecard(user, SEPT)
        stored = ScorecardMonthSnapshot.objects.get().payload['meetings']
        self.assertEqual(again['meetings'], stored)

    def test_trend_agrees_with_the_scorecard_for_frozen_months(self):
        freeze_scorecard_months(now=AFTER)
        self.m2.profile.teams.clear()
        user = self.at(AFTER)
        points = scorecard_trend(user, 3, date(2026, 10, 1))
        self.assertEqual([p['month'] for p in points], ['2026-08-01', '2026-09-01', '2026-10-01'])
        self.assertEqual(points[1]['team_size'], 2)
        self.assertTrue(points[1]['frozen'])
        self.assertEqual(points[2]['team_size'], 1)
        self.assertEqual(points[1]['leave'], build_scorecard(user, SEPT)['leave'])

    def test_command_backfills_a_chosen_month_and_is_idempotent(self):
        out = StringIO()
        with patch('django.utils.timezone.now', return_value=AFTER):
            call_command('freeze_scorecard_months', month='2026-09-01', stdout=out)
            call_command('freeze_scorecard_months', month='2026-09-01', stdout=out)
        self.assertEqual(ScorecardMonthSnapshot.objects.count(), 1)
        self.assertIn('Snapshotted 1', out.getvalue())

    def test_command_refuses_a_month_that_is_not_frozen_yet(self):
        from django.core.management.base import CommandError
        with patch('django.utils.timezone.now', return_value=BEFORE):
            with self.assertRaises(CommandError):
                call_command('freeze_scorecard_months', month='2026-09-01', stdout=StringIO())
