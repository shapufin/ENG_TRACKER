from datetime import date

from django.test import TestCase

from apps.dashboard.models.calendar import PublicHoliday
from core.utils.working_days import (
    is_working_day,
    month_cutoff_date,
    month_end_working_day,
    next_working_day,
)


class WorkingDayTests(TestCase):
    def _holiday(self, day):
        PublicHoliday.objects.create(name='H', date=day, country_code='AL')

    def test_weekday_is_working_day_and_weekend_is_not(self):
        self.assertTrue(is_working_day(date(2026, 11, 5)))  # Thursday
        self.assertFalse(is_working_day(date(2026, 11, 7)))  # Saturday
        self.assertFalse(is_working_day(date(2026, 11, 8)))  # Sunday

    def test_global_holiday_is_not_a_working_day(self):
        self._holiday(date(2026, 11, 5))
        self.assertFalse(is_working_day(date(2026, 11, 5)))
        self.assertTrue(is_working_day(date(2026, 11, 6)))

    def test_soft_deleted_holiday_is_ignored(self):
        PublicHoliday.objects.create(name='H', date=date(2026, 11, 5), country_code='AL', is_deleted=True)
        self.assertTrue(is_working_day(date(2026, 11, 5)))

    def test_next_working_day_skips_weekend_and_holiday_chain(self):
        # Fri 2026-11-06 holiday, Sat, Sun -> Monday
        self._holiday(date(2026, 11, 6))
        self.assertEqual(next_working_day(date(2026, 11, 6)), date(2026, 11, 9))
        self.assertEqual(next_working_day(date(2026, 11, 9)), date(2026, 11, 9))

    def test_month_end_rolls_back_never_into_next_month(self):
        # 2026-10-31 is a Saturday -> Friday the 30th, not Monday Nov 2.
        self.assertEqual(month_end_working_day(2026, 10), date(2026, 10, 30))
        # Last day is a weekday.
        self.assertEqual(month_end_working_day(2026, 11), date(2026, 11, 30))

    def test_month_end_skips_trailing_holiday(self):
        self._holiday(date(2026, 11, 30))
        self.assertEqual(month_end_working_day(2026, 11), date(2026, 11, 27))

    def test_cutoff_is_day_two_postponed_to_next_working_day(self):
        # 2026-08-02 is a Sunday -> Monday the 3rd.
        self.assertEqual(month_cutoff_date(2026, 7), date(2026, 8, 3))
        # 2026-10-02 is a Friday -> stays.
        self.assertEqual(month_cutoff_date(2026, 9), date(2026, 10, 2))

    def test_cutoff_handles_december_rollover_and_holiday(self):
        self._holiday(date(2027, 1, 2))  # Saturday anyway
        self.assertEqual(month_cutoff_date(2026, 12), date(2027, 1, 4))

    def test_cutoff_across_years_2026_to_2030(self):
        for year in range(2026, 2031):
            for month in range(1, 13):
                cutoff = month_cutoff_date(year, month)
                self.assertTrue(is_working_day(cutoff))
                self.assertGreaterEqual(cutoff.day, 2)
                self.assertLessEqual((cutoff - date(year + (month == 12), month % 12 + 1, 2)).days, 3)
