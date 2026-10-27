from datetime import date, datetime
from zoneinfo import ZoneInfo

from django.test import SimpleTestCase, override_settings

from core.utils.metrics_freeze import freeze_at, is_frozen, is_past_freeze

TIRANE = ZoneInfo('Europe/Tirane')


class MetricsFreezeTests(SimpleTestCase):
    def test_freeze_is_midnight_of_the_10th_of_the_next_month_in_business_tz(self):
        self.assertEqual(freeze_at(date(2026, 9, 17)), datetime(2026, 10, 10, tzinfo=TIRANE))

    def test_december_rolls_into_january(self):
        self.assertEqual(freeze_at(date(2026, 12, 1)), datetime(2027, 1, 10, tzinfo=TIRANE))

    @override_settings(METRICS_FREEZE_DAY=3)
    def test_day_is_configurable(self):
        self.assertEqual(freeze_at(date(2026, 9, 1)), datetime(2026, 10, 3, tzinfo=TIRANE))

    def test_boundary_is_inclusive_at_midnight(self):
        month = date(2026, 9, 1)
        self.assertFalse(is_past_freeze(month, now=datetime(2026, 10, 9, 23, 59, 59, tzinfo=TIRANE)))
        self.assertTrue(is_past_freeze(month, now=datetime(2026, 10, 10, 0, 0, 0, tzinfo=TIRANE)))

    def test_row_is_final_only_if_computed_at_or_after_the_freeze(self):
        month = date(2026, 9, 1)
        now = datetime(2026, 10, 20, tzinfo=TIRANE)
        before = datetime(2026, 10, 5, tzinfo=TIRANE)
        after = datetime(2026, 10, 10, 0, 0, 1, tzinfo=TIRANE)
        self.assertFalse(is_frozen(month, before, now=now))  # provisional: needs one final compute
        self.assertFalse(is_frozen(month, None, now=now))  # never computed
        self.assertTrue(is_frozen(month, after, now=now))

    def test_nothing_is_frozen_before_the_freeze_moment(self):
        month = date(2026, 9, 1)
        now = datetime(2026, 10, 9, tzinfo=TIRANE)
        self.assertFalse(is_frozen(month, datetime(2026, 10, 9, tzinfo=TIRANE), now=now))
