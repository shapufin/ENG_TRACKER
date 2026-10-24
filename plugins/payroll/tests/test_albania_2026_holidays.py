from datetime import date, timedelta

from django.test import SimpleTestCase

from plugins.payroll.services.calendar_service import ALBANIA_2026_HOLIDAYS


class Albania2026HolidayTests(SimpleTestCase):
    def test_every_weekend_holiday_is_observed_on_a_weekday(self):
        for day, name in ALBANIA_2026_HOLIDAYS.items():
            if day.weekday() < 5 or name.endswith('(observed)'):
                continue
            observed = [
                d for d in (day + timedelta(days=n) for n in range(1, 5))
                if d.weekday() < 5 and d in ALBANIA_2026_HOLIDAYS
            ]
            self.assertTrue(observed, f'{name} on {day} has no weekday holiday after it')

    def test_observed_days_are_weekdays(self):
        for day, name in ALBANIA_2026_HOLIDAYS.items():
            if name.endswith('(observed)'):
                self.assertLess(day.weekday(), 5, f'{name} on {day} is on a weekend')

    def test_unofficial_dates_are_not_holidays(self):
        for day in (date(2026, 6, 29), date(2026, 10, 19)):
            self.assertNotIn(day, ALBANIA_2026_HOLIDAYS)
