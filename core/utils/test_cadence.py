from datetime import date

from django.test import SimpleTestCase

from core.utils.cadence import next_due_slot, raw_next_due


class RawNextDueTests(SimpleTestCase):
    def test_weekly_first_slot_is_the_chosen_weekday_on_or_after_start(self):
        # 2026-11-16 is a Monday; Wednesday (2) is two days later.
        self.assertEqual(
            raw_next_due('weekly', 2, None, date(2026, 11, 16), None), date(2026, 11, 18)
        )

    def test_biweekly_steps_fourteen_days_from_the_last_slot(self):
        self.assertEqual(
            raw_next_due('biweekly', 0, None, date(2026, 11, 2), date(2026, 11, 2)),
            date(2026, 11, 16),
        )

    def test_monthly_without_a_pattern_clamps_to_month_end(self):
        self.assertEqual(
            raw_next_due('monthly', None, None, date(2026, 1, 1), date(2026, 1, 31)),
            date(2026, 2, 28),
        )

    def test_monthly_without_a_pattern_returns_to_the_start_day_after_a_short_month(self):
        # R4: 31 Jan -> 28 Feb must not become 28 Mar and 28 Apr; the plan day is the 31st.
        start = date(2026, 1, 31)
        feb = raw_next_due('monthly', None, None, start, date(2026, 1, 31))
        self.assertEqual(feb, date(2026, 2, 28))
        self.assertEqual(raw_next_due('monthly', None, None, start, feb), date(2026, 3, 31))

    def test_monthly_without_a_pattern_keeps_a_late_meeting_as_the_anchor(self):
        self.assertEqual(
            raw_next_due('monthly', None, None, date(2026, 11, 5), date(2026, 11, 20)), date(2026, 12, 20),
        )

    def test_monthly_nth_weekday_moves_to_the_next_month(self):
        # 2nd Tuesday of December 2026 is the 8th.
        self.assertEqual(
            raw_next_due('monthly', 1, 2, date(2026, 1, 1), date(2026, 11, 10)),
            date(2026, 12, 8),
        )


class NextDueSlotTests(SimpleTestCase):
    def test_a_blocked_date_moves_to_the_following_slot(self):
        due, moved_from = next_due_slot(
            'weekly', 2, None, date(2026, 11, 16), None, blocked={date(2026, 11, 18)}
        )
        self.assertEqual((due, moved_from), (date(2026, 11, 25), date(2026, 11, 18)))

    def test_nothing_blocked_returns_the_raw_slot(self):
        self.assertEqual(
            next_due_slot('weekly', 2, None, date(2026, 11, 16), None, blocked=set()),
            (date(2026, 11, 18), None),
        )

    def test_no_cadence_has_no_slot(self):
        self.assertEqual(
            next_due_slot(None, None, None, date(2026, 11, 16), None, blocked=set()),
            (None, None),
        )
