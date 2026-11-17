"""Recurring 1-on-1 plans: the schedule is computed, the leader confirms or skips.

The rules these pin: a plan never creates a meeting, a skip is not a held meeting, due
dates move past public holidays and the employee's approved leave, and only the leader's
own scoreable members can be planned.
"""
from datetime import date

from django.core.exceptions import ValidationError
from django.test import TestCase

from apps.dashboard.models.calendar import PublicHoliday
from apps.leave_management.models import LeaveRequest
from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role

from . import one_on_one
from .models import Meeting, OneOnOnePlan, OneOnOneSkip
from .testing import make_user


class OneOnOneBase(TestCase):
    def setUp(self):
        for code in ('italian_tl', 'albanian_tl'):
            Role.objects.get_or_create(code=code, defaults={'name': code})
        self.lm = make_user('oo_lm')
        assign_role(self.lm, 'albanian_tl')
        self.emp = make_user('oo_emp')
        self.emp.profile.albanian_tl = self.lm
        self.emp.profile.save()
        self.stranger = make_user('oo_stranger')
        # 2026-11-16 is a Monday.
        self.start = date(2026, 11, 16)

    def plan(self, **kw):
        args = dict(cadence='weekly', day_of_week=2, nth_week=None, effective_from=self.start)
        args.update(kw)
        return one_on_one.set_plan(self.lm, self.emp, **args)


class SetPlanTests(OneOnOneBase):
    def test_creates_one_plan_and_updates_it_in_place(self):
        self.plan()
        self.plan(cadence='biweekly')
        self.assertEqual(OneOnOnePlan.objects.count(), 1)
        self.assertEqual(OneOnOnePlan.objects.get().cadence, 'biweekly')

    def test_refuses_someone_outside_the_leaders_team(self):
        with self.assertRaises(ValidationError):
            one_on_one.set_plan(
                self.lm, self.stranger, cadence='weekly', day_of_week=None,
                nth_week=None, effective_from=self.start,
            )

    def test_refuses_an_invalid_schedule(self):
        with self.assertRaises(ValidationError):
            self.plan(cadence='weekly', nth_week=2)

    def test_creating_a_plan_never_creates_a_meeting(self):
        self.plan()
        self.assertEqual(Meeting.objects.count(), 0)

    def test_clear_removes_the_plan_but_keeps_skips(self):
        self.plan()
        one_on_one.skip_slot(self.lm, self.emp, reason='Employee on a client site', today=date(2026, 11, 18))
        one_on_one.clear_plan(self.lm, self.emp)
        self.assertEqual(OneOnOnePlan.objects.count(), 0)
        self.assertEqual(OneOnOneSkip.objects.count(), 1)


class NextSlotTests(OneOnOneBase):
    def test_first_slot_is_the_chosen_weekday(self):
        slot = one_on_one.next_slot(self.plan(), today=self.start)
        self.assertEqual((slot.due_on, slot.status), (date(2026, 11, 18), 'upcoming'))

    def test_due_and_overdue_states(self):
        plan = self.plan()
        self.assertEqual(one_on_one.next_slot(plan, today=date(2026, 11, 18)).status, 'due')
        self.assertEqual(one_on_one.next_slot(plan, today=date(2026, 11, 19)).status, 'overdue')

    def test_a_held_meeting_moves_the_next_slot_on(self):
        plan = self.plan()
        Meeting.objects.create(
            meeting_type='one_on_one', organizer=self.lm, counterparty=self.emp,
            occurred_on=date(2026, 11, 18),
        )
        slot = one_on_one.next_slot(plan, today=date(2026, 11, 19))
        self.assertEqual(slot.due_on, date(2026, 11, 25))

    def test_a_public_holiday_moves_the_slot(self):
        PublicHoliday.objects.create(name='Holiday', date=date(2026, 11, 18))
        slot = one_on_one.next_slot(self.plan(), today=self.start)
        self.assertEqual(slot.due_on, date(2026, 11, 25))
        self.assertEqual(slot.moved_from, date(2026, 11, 18))
        self.assertEqual(slot.moved_reason, 'holiday')

    def test_approved_leave_moves_the_slot_but_pending_leave_does_not(self):
        plan = self.plan()
        LeaveRequest.objects.create(
            user=self.emp, request_type='vacation', start_date=date(2026, 11, 18),
            end_date=date(2026, 11, 18), status='pending',
        )
        self.assertEqual(one_on_one.next_slot(plan, today=self.start).due_on, date(2026, 11, 18))
        LeaveRequest.objects.update(status='approved')
        slot = one_on_one.next_slot(plan, today=self.start)
        self.assertEqual((slot.due_on, slot.moved_reason), (date(2026, 11, 25), 'leave'))


class LongLeaveTests(OneOnOneBase):
    """M3 (audit 2026-11-16): the slot must clear a long leave, not stop after six steps."""

    def test_a_weekly_slot_lands_after_ten_weeks_of_leave(self):
        plan = self.plan()  # Wednesdays from 2026-11-18
        LeaveRequest.objects.create(
            user=self.emp, request_type='vacation', start_date=date(2026, 11, 18),
            end_date=date(2027, 1, 26), status='approved',
        )
        slot = one_on_one.next_slot(plan, today=self.start)
        self.assertEqual(slot.due_on, date(2027, 1, 27))
        self.assertEqual((slot.moved_from, slot.moved_reason), (date(2026, 11, 18), 'leave'))
        self.assertEqual(slot.status, 'upcoming')

    def test_a_leave_longer_than_the_lookahead_still_ends_the_search(self):
        plan = self.plan()
        LeaveRequest.objects.create(
            user=self.emp, request_type='vacation', start_date=date(2026, 11, 18),
            end_date=date(2028, 12, 31), status='approved',
        )
        slot = one_on_one.next_slot(plan, today=self.start)  # must terminate, not loop
        self.assertGreater(slot.due_on, date(2027, 11, 1))


class ReminderRobustnessTests(OneOnOneBase):
    def test_one_employee_without_a_profile_row_does_not_stop_everyone_elses_reminder(self):
        self.plan()
        orphan = make_user('oo_orphan')
        OneOnOnePlan.objects.create(
            leader=self.lm, employee=orphan, cadence='weekly', cadence_day_of_week=2,
            effective_from=self.start,
        )
        orphan.profile.delete()

        one_on_one.process_one_on_one_reminders(today=date(2026, 12, 1))  # must not raise


class SkipTests(OneOnOneBase):
    def test_skip_needs_a_reason(self):
        self.plan()
        with self.assertRaises(ValidationError):
            one_on_one.skip_slot(self.lm, self.emp, reason='  ', today=self.start)

    def test_skip_moves_the_next_slot_on_without_counting_as_held(self):
        plan = self.plan()
        one_on_one.skip_slot(self.lm, self.emp, reason='Sick day', today=date(2026, 11, 18))
        self.assertEqual(one_on_one.next_slot(plan, today=date(2026, 11, 19)).due_on, date(2026, 11, 25))
        self.assertEqual(Meeting.objects.count(), 0)

    def test_a_slot_that_is_not_due_yet_cannot_be_skipped(self):
        self.plan()
        with self.assertRaises(ValidationError):
            one_on_one.skip_slot(self.lm, self.emp, reason='Too early', today=self.start)

    def test_after_a_skip_the_next_slot_is_not_due_so_it_cannot_be_skipped_again(self):
        self.plan()
        one_on_one.skip_slot(self.lm, self.emp, reason='Sick day', today=date(2026, 11, 18))
        with self.assertRaises(ValidationError):
            one_on_one.skip_slot(self.lm, self.emp, reason='Again', today=date(2026, 11, 18))

    def test_skip_requires_a_plan(self):
        with self.assertRaises(ValidationError):
            one_on_one.skip_slot(self.lm, self.emp, reason='Reason', today=self.start)


class ComplianceTests(OneOnOneBase):
    """Ruling R1: a skip with a reason is not a miss; a skipped person leaves the denominator."""

    def setUp(self):
        super().setUp()
        self.emp2 = make_user('oo_emp2')
        self.emp2.profile.albanian_tl = self.lm
        self.emp2.profile.save()
        self.month = date(2026, 11, 1)
        self.team = [self.emp.id, self.emp2.id]

    def _pct(self):
        from .services import meeting_compliance_metrics
        return meeting_compliance_metrics(self.lm, self.team, self.month)['one_on_one_compliance_pct']

    def _held(self, user):
        Meeting.objects.create(
            meeting_type='one_on_one', organizer=self.lm, counterparty=user, occurred_on=date(2026, 11, 10),
        )

    def _skip(self, user, day=date(2026, 11, 12)):
        OneOnOneSkip.objects.create(leader=self.lm, employee=user, slot_date=day, reason='Client site')

    def test_a_skipped_person_is_not_a_miss(self):
        self._held(self.emp)
        self._skip(self.emp2)
        self.assertEqual(self._pct(), 100.0)

    def test_an_unskipped_missing_person_still_counts_as_a_miss(self):
        self._held(self.emp)
        self.assertEqual(self._pct(), 50.0)

    def test_everyone_skipped_gives_no_percentage(self):
        self._skip(self.emp)
        self._skip(self.emp2)
        self.assertIsNone(self._pct())

    def test_a_skip_in_another_month_does_not_excuse_this_one(self):
        self._held(self.emp)
        self._skip(self.emp2, day=date(2026, 10, 12))
        self.assertEqual(self._pct(), 50.0)

    def test_a_blank_reason_never_excuses(self):
        self._held(self.emp)
        OneOnOneSkip.objects.create(leader=self.lm, employee=self.emp2, slot_date=date(2026, 11, 12), reason='  ')
        self.assertEqual(self._pct(), 50.0)


class StalePlanTests(OneOnOneBase):
    def test_a_leader_cannot_skip_for_someone_no_longer_on_their_team(self):
        self.plan()
        self.emp.profile.albanian_tl = None
        self.emp.profile.save()
        fresh_leader = type(self.lm).objects.get(pk=self.lm.pk)  # scope is cached per profile object
        with self.assertRaises(ValidationError):
            one_on_one.skip_slot(fresh_leader, self.emp, reason='Reason', today=date(2026, 11, 18))
