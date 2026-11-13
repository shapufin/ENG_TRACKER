"""Scorecard overtime turnaround follows the owner rule (Option A, 2026-11-13).

A leader keeps the turnaround of the overtime they decided, even after the employee moves
to another Line Manager. The new leader does not inherit it.
"""
from django.test import TestCase
from django.utils import timezone

from apps.overtime.models.core import OvertimeLog

from .scope import scoreable_member_ids
from .services import month_blocks
from .test_tl_scorecard import _assign_tl_role, _make_user, _overtime


class ScorecardOwnerRuleTests(TestCase):
    def setUp(self):
        self.old_lm = _make_user('own_sc_old')
        _assign_tl_role(self.old_lm, 'albanian_tl')
        self.new_lm = _make_user('own_sc_new')
        _assign_tl_role(self.new_lm, 'albanian_tl')
        self.member = _make_user('own_sc_member')
        self.member.profile.albanian_tl = self.old_lm
        self.member.profile.save()
        self.month = timezone.now().replace(day=15, hour=12, minute=0, second=0, microsecond=0)
        self.month_start = self.month.replace(day=1)

    def _decided_by_old_lm(self):
        row = _overtime(self.member, self.month, approved_at=self.month)
        OvertimeLog.objects.filter(pk=row.pk).update(approved_by=self.old_lm)
        return row

    def _move_to_new_lm(self):
        self.member.profile.albanian_tl = self.new_lm
        self.member.profile.save()

    def _turnaround(self, leader):
        blocks = month_blocks(leader, self.month_start, scoreable_member_ids(leader))
        return blocks['overtime']['decided_count']

    def test_decided_turnaround_stays_with_the_approver_after_a_move(self):
        self._decided_by_old_lm()
        self._move_to_new_lm()
        self.assertEqual(self._turnaround(self.old_lm), 1)
        self.assertEqual(self._turnaround(self.new_lm), 0)

    def test_turnaround_is_counted_once_across_both_leaders(self):
        self._decided_by_old_lm()
        self._move_to_new_lm()
        self.assertEqual(self._turnaround(self.old_lm) + self._turnaround(self.new_lm), 1)
