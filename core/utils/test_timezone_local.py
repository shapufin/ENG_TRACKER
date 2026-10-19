"""The business calendar day: 00:30 on the 1st in Tirane is still the previous
day in UTC, so the local helper and the UTC date must disagree there. The zone
is the admin-editable ``GlobalSettings.business_timezone`` (default Tirane)."""
from datetime import date, datetime, timezone
from unittest import mock

from django.core.exceptions import ValidationError
from django.test import TestCase

from apps.leave_management.models import GlobalSettings
from core.utils import timezone_local
from core.utils.timezone_local import (
    business_today, business_tz, clear_business_tz_cache, validate_business_timezone,
)


def _frozen_at(instant):
    """Patch the module clock so datetime.now(tz) returns `instant` in tz."""
    fake = mock.MagicMock(wraps=datetime)
    fake.now.side_effect = lambda tz=None: instant.astimezone(tz)
    return mock.patch.object(timezone_local, 'datetime', fake)


class BusinessTimezoneTestCase(TestCase):
    def setUp(self):
        clear_business_tz_cache()
        # TestCase rollback fires no signals, so drop the cached zone afterwards.
        self.addCleanup(clear_business_tz_cache)

    def set_zone(self, name):
        GlobalSettings.objects.update_or_create(pk=1, defaults={'business_timezone': name})
        clear_business_tz_cache()


class BusinessTzTests(BusinessTimezoneTestCase):
    def test_defaults_to_tirane_without_a_settings_row(self):
        self.assertEqual(str(business_tz()), 'Europe/Tirane')

    def test_reads_the_setting(self):
        self.set_zone('America/New_York')
        self.assertEqual(str(business_tz()), 'America/New_York')

    def test_bad_stored_value_falls_back_to_tirane(self):
        GlobalSettings.objects.update_or_create(pk=1, defaults={'business_timezone': 'Mars/Olympus'})
        clear_business_tz_cache()
        self.assertEqual(str(business_tz()), 'Europe/Tirane')

    def test_saving_the_settings_drops_the_cached_zone(self):
        self.set_zone('America/New_York')
        self.assertEqual(str(business_tz()), 'America/New_York')
        row = GlobalSettings.objects.get(pk=1)
        row.business_timezone = 'Asia/Tokyo'
        row.save()  # no explicit cache clear: save() must do it
        self.assertEqual(str(business_tz()), 'Asia/Tokyo')

    def test_second_read_is_served_from_cache(self):
        business_tz()
        with self.assertNumQueries(0):
            business_tz()


class BusinessTodayTests(BusinessTimezoneTestCase):
    def test_at_0030_on_the_first_it_is_the_new_day_in_tirane(self):
        # 2026-10-01 00:30 Tirane (UTC+2 in October) == 2026-09-30 22:30 UTC.
        instant = datetime(2026, 9, 30, 22, 30, tzinfo=timezone.utc)
        with _frozen_at(instant):
            self.assertEqual(business_today(), date(2026, 10, 1))
        self.assertEqual(instant.date(), date(2026, 9, 30))

    def test_late_evening_utc_is_the_next_day_in_tirane(self):
        instant = datetime(2026, 10, 31, 23, 30, tzinfo=timezone.utc)
        with _frozen_at(instant):
            self.assertEqual(business_today(), date(2026, 11, 1))

    def test_dst_boundaries_use_the_right_offset(self):
        # CET (UTC+1) in winter: 22:30 UTC is still the same day only before 23:00.
        with _frozen_at(datetime(2026, 12, 15, 22, 30, tzinfo=timezone.utc)):
            self.assertEqual(business_today(), date(2026, 12, 15))
        with _frozen_at(datetime(2026, 12, 15, 23, 30, tzinfo=timezone.utc)):
            self.assertEqual(business_today(), date(2026, 12, 16))
        # CEST (UTC+2) in summer: the day flips an hour earlier.
        with _frozen_at(datetime(2026, 7, 15, 22, 30, tzinfo=timezone.utc)):
            self.assertEqual(business_today(), date(2026, 7, 16))

    def test_follows_the_configured_zone(self):
        self.set_zone('America/New_York')
        # 02:30 UTC on the 2nd is still the 1st (22:30) in New York (UTC-4 in October).
        with _frozen_at(datetime(2026, 10, 2, 2, 30, tzinfo=timezone.utc)):
            self.assertEqual(business_today(), date(2026, 10, 1))


class ValidateBusinessTimezoneTests(TestCase):
    def test_accepts_iana_names(self):
        validate_business_timezone('Europe/Tirane')
        validate_business_timezone('UTC')

    def test_rejects_unknown_names(self):
        for bad in ('Mars/Olympus', '', 'Europe/../etc', '+02:00'):
            with self.subTest(bad=bad), self.assertRaises(ValidationError):
                validate_business_timezone(bad)
