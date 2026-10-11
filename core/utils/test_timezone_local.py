"""Albania's local calendar date: 00:30 on the 1st in Tirane is still the
previous day in UTC, so the local helper and the UTC date must disagree there."""
from datetime import date, datetime, timezone
from unittest import mock
from django.test import SimpleTestCase

from core.utils import timezone_local
from core.utils.timezone_local import TIRANA, tirana_today


def _frozen_at(instant):
    """Patch the module clock so datetime.now(tz) returns `instant` in tz."""
    fake = mock.MagicMock(wraps=datetime)
    fake.now.side_effect = lambda tz=None: instant.astimezone(tz)
    return mock.patch.object(timezone_local, 'datetime', fake)


class TiranaTodayTests(SimpleTestCase):
    def test_zone_is_europe_tirane(self):
        self.assertEqual(str(TIRANA), 'Europe/Tirane')

    def test_at_0030_on_the_first_it_is_the_new_day_in_tirane(self):
        # 2026-10-01 00:30 Tirane (UTC+2 in October) == 2026-09-30 22:30 UTC.
        instant = datetime(2026, 9, 30, 22, 30, tzinfo=timezone.utc)
        with _frozen_at(instant):
            self.assertEqual(tirana_today(), date(2026, 10, 1))
        self.assertEqual(instant.date(), date(2026, 9, 30))

    def test_late_evening_utc_is_the_next_day_in_tirane(self):
        instant = datetime(2026, 10, 31, 23, 30, tzinfo=timezone.utc)
        with _frozen_at(instant):
            self.assertEqual(tirana_today(), date(2026, 11, 1))
