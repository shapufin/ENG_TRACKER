"""A leader whose month the system had to close loses engagement points; on time costs nothing."""
from datetime import date, datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.overtime.models.core import OvertimeLog
from apps.users.services.approval_periods import (
    LATE_CLOSURE_PENALTY_POINTS,
    auto_finalize_approval_periods,
    finalize_period,
)
from plugins.engagement.services import compute_engagement_score, compute_tl_metric, is_stale
from plugins.engagement.test_engagement import _join, _make_client, _make_overtime, _make_team, _make_user
from plugins.engagement.test_engagement_sla import _at

User = get_user_model()
TIRANE = ZoneInfo('Europe/Tirane')
OCT = date(2026, 10, 1)
BEFORE_CUTOFF = datetime(2026, 11, 1, 12, 0, tzinfo=TIRANE)
AFTER_CUTOFF = datetime(2026, 11, 2, 9, 0, tzinfo=TIRANE)


def _clock(moment):
    return patch('plugins.engagement.services._now', return_value=moment)


class ClosurePenaltyTests(TestCase):
    def setUp(self):
        self.leader = _make_user('pen_leader')
        self.team = _make_team('Pen Team', 'PEN', leader=self.leader)
        self.member = _make_user('pen_member')
        _join(self.member, self.team)
        # An approved, on-time decision so the leader has a real score to deduct from.
        day = OCT.replace(day=9)
        _make_overtime(self.member, day, _at(day, 10), status='approved', client=_make_client(),
                       approved_by=self.leader, approved_at=_at(day, 11))

    def _snapshot(self, moment):
        with _clock(moment):
            return compute_tl_metric(self.leader, self.team, OCT)

    def test_no_verdict_before_the_cutoff(self):
        snap = self._snapshot(BEFORE_CUTOFF)
        self.assertIsNone(snap.closure_on_time)
        self.assertEqual(snap.late_closure_penalty, 0.0)

    def test_leader_who_closed_in_time_keeps_the_full_score(self):
        with patch('django.utils.timezone.now', return_value=BEFORE_CUTOFF):
            finalize_period(self.leader, OCT)
        snap = self._snapshot(AFTER_CUTOFF)
        self.assertTrue(snap.closure_on_time)
        self.assertEqual(snap.late_closure_penalty, 0.0)

    def test_system_close_costs_the_leader_points(self):
        baseline = self._snapshot(BEFORE_CUTOFF).engagement_score
        self.assertIsNotNone(baseline)
        auto_finalize_approval_periods(OCT, now=AFTER_CUTOFF)
        snap = self._snapshot(AFTER_CUTOFF)
        self.assertFalse(snap.closure_on_time)
        self.assertEqual(snap.late_closure_penalty, LATE_CLOSURE_PENALTY_POINTS)
        self.assertEqual(snap.engagement_score, round(max(0.0, baseline - LATE_CLOSURE_PENALTY_POINTS), 2))

    def test_unclosed_month_after_the_cutoff_is_late_before_any_sweep(self):
        self.assertFalse(self._snapshot(AFTER_CUTOFF).closure_on_time)

    def test_a_close_after_the_cutoff_is_still_late(self):
        with patch('django.utils.timezone.now', return_value=AFTER_CUTOFF):
            finalize_period(self.leader, OCT)
        self.assertFalse(self._snapshot(AFTER_CUTOFF).closure_on_time)

    def test_superusers_and_inactive_users_are_never_expected_to_be_closed(self):
        boss = User.objects.create_superuser('pen_boss', password='x')
        _join(boss, self.team)
        gone = _make_user('pen_gone')
        _join(gone, self.team)
        User.objects.filter(pk=gone.pk).update(is_active=False)
        with patch('django.utils.timezone.now', return_value=BEFORE_CUTOFF):
            finalize_period(self.leader, OCT)
        self.assertTrue(self._snapshot(AFTER_CUTOFF).closure_on_time)

    def test_a_snapshot_computed_before_the_cutoff_is_stale_once_it_passes(self):
        snap = self._snapshot(BEFORE_CUTOFF)
        OvertimeLog.objects.update(updated_at=_at(OCT.replace(day=9), 12))  # untouched since
        with _clock(BEFORE_CUTOFF):
            self.assertFalse(is_stale(snap))
        with _clock(AFTER_CUTOFF):
            self.assertTrue(is_stale(snap))

    def test_a_score_without_data_stays_empty(self):
        score, _parts = compute_engagement_score({}, [])
        self.assertIsNone(score)
