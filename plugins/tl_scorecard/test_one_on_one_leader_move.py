"""R2 (audit 2026-11-16): a recurring 1-on-1 plan ends when the employee leaves that Line Manager."""
from datetime import date

from apps.users.services.user_creation import clear_lm_link_on_promotion, record_leader_link_change

from .models import OneOnOnePlan, OneOnOneSkip
from .test_one_on_one_plans import OneOnOneBase
from .testing import make_user


class LeaderMoveEndsThePlanTests(OneOnOneBase):
    def setUp(self):
        super().setUp()
        self.plan()
        self.other = make_user('oo_other_emp')
        self.other.profile.albanian_tl = self.lm
        self.other.profile.save()
        one_on_one_other = OneOnOnePlan.objects.create(
            leader=self.lm, employee=self.other, cadence='weekly', cadence_day_of_week=2,
            effective_from=self.start,
        )
        self.other_plan_id = one_on_one_other.pk

    def _move(self, field='albanian_tl', old=None, new=None):
        record_leader_link_change(None, self.emp.profile, field, old if old is not None else self.lm.pk, new)

    def test_moving_to_another_line_manager_removes_that_employees_plan_only(self):
        self._move(new=None)
        self.assertFalse(OneOnOnePlan.objects.filter(employee=self.emp).exists())
        self.assertTrue(OneOnOnePlan.objects.filter(pk=self.other_plan_id).exists())

    def test_skips_are_kept(self):
        OneOnOneSkip.objects.create(leader=self.lm, employee=self.emp, slot_date=date(2026, 11, 18), reason='Sick')
        self._move(new=None)
        self.assertEqual(OneOnOneSkip.objects.count(), 1)

    def test_a_manager_change_does_not_touch_the_plan(self):
        record_leader_link_change(None, self.emp.profile, 'italian_tl', 999, 1000)
        self.assertTrue(OneOnOnePlan.objects.filter(employee=self.emp).exists())

    def test_an_unchanged_link_does_not_touch_the_plan(self):
        record_leader_link_change(None, self.emp.profile, 'albanian_tl', self.lm.pk, self.lm.pk)
        self.assertTrue(OneOnOnePlan.objects.filter(employee=self.emp).exists())

    def test_promotion_to_line_manager_ends_the_plan_the_old_leader_had_for_them(self):
        clear_lm_link_on_promotion(self.emp.profile)
        self.assertFalse(OneOnOnePlan.objects.filter(employee=self.emp).exists())
