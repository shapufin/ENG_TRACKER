"""Tests for bi-directional holiday sync between HR PublicHolidays and Payroll."""
from datetime import date
from decimal import Decimal
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.dashboard.models.calendar import PublicHoliday
from apps.dashboard.services.holiday_sync import sync_holidays_between_hr_and_payroll
from apps.plugins.models import Plugin
from plugins.payroll.models import PayrollWorkCalendar, PayrollWorkday


class HolidaySyncServiceTests(TestCase):
    def setUp(self):
        self.payroll_plugin, _ = Plugin.objects.update_or_create(
            name='payroll',
            defaults={'is_enabled': True, 'verbose_name': 'Payroll', 'version': '1.0.0'},
        )
        self.cal = PayrollWorkCalendar.objects.create(
            country='AL', year=2026, is_active=True
        )
        # Create normal workday in Payroll
        self.wd1 = PayrollWorkday.objects.create(
            calendar=self.cal,
            date=date(2026, 1, 1),
            is_working_day=False,
            is_holiday=True,
            holiday_name="New Year's Day",
            standard_hours=Decimal('0'),
        )
        self.wd2 = PayrollWorkday.objects.create(
            calendar=self.cal,
            date=date(2026, 3, 14),
            is_working_day=False,
            is_holiday=True,
            holiday_name='Summer Day',
            standard_hours=Decimal('0'),
        )
        self.wd_work = PayrollWorkday.objects.create(
            calendar=self.cal,
            date=date(2026, 6, 1),
            is_working_day=True,
            is_holiday=False,
            holiday_name='',
            standard_hours=Decimal('8'),
        )

    def test_sync_backfills_payroll_holidays_to_hr(self):
        """When HR is missing holidays that exist in Payroll, sync creates them in PublicHoliday."""
        self.assertFalse(PublicHoliday.objects.filter(date=date(2026, 1, 1)).exists())
        self.assertFalse(PublicHoliday.objects.filter(date=date(2026, 3, 14)).exists())

        result = sync_holidays_between_hr_and_payroll(year=2026)
        self.assertEqual(result['status'], 'success')
        self.assertEqual(result['synced_to_hr'], 2)

        h1 = PublicHoliday.objects.get(date=date(2026, 1, 1), calendar__isnull=True)
        self.assertEqual(h1.name, "New Year's Day")
        self.assertTrue(h1.is_global)

        h2 = PublicHoliday.objects.get(date=date(2026, 3, 14), calendar__isnull=True)
        self.assertEqual(h2.name, 'Summer Day')

    def test_sync_inherits_hr_holidays_to_payroll(self):
        """When HR has a holiday not in Payroll, sync creates or updates the Payroll workday."""
        PublicHoliday.objects.create(
            date=date(2026, 6, 1),
            name='Children Day',
            is_global=True,
            country_code='AL',
        )

        result = sync_holidays_between_hr_and_payroll(year=2026)
        self.assertEqual(result['status'], 'success')
        self.wd_work.refresh_from_db()
        self.assertTrue(self.wd_work.is_holiday)
        self.assertFalse(self.wd_work.is_working_day)
        self.assertEqual(self.wd_work.holiday_name, 'Children Day')
        self.assertEqual(self.wd_work.standard_hours, Decimal('0'))

    def test_signal_on_date_change_restores_old_workday(self):
        """When a PublicHoliday changes date, the old date is restored in Payroll and new date marked as holiday."""
        h = PublicHoliday.objects.create(
            date=date(2026, 6, 1),
            name='Test Move',
            is_global=True,
            country_code='AL',
        )
        self.wd_work.refresh_from_db()
        self.assertTrue(self.wd_work.is_holiday)

        # Create workday for target date (June 2)
        wd_june2 = PayrollWorkday.objects.create(
            calendar=self.cal,
            date=date(2026, 6, 2),
            is_working_day=True,
            is_holiday=False,
            standard_hours=Decimal('8'),
        )

        # Move holiday date to June 2
        h.date = date(2026, 6, 2)
        h.save()

        # Old date (June 1) should be restored
        self.wd_work.refresh_from_db()
        self.assertFalse(self.wd_work.is_holiday)
        self.assertTrue(self.wd_work.is_working_day)
        self.assertEqual(self.wd_work.standard_hours, Decimal('8'))

        # New date (June 2) should be a holiday
        wd_june2.refresh_from_db()
        self.assertTrue(wd_june2.is_holiday)
        self.assertFalse(wd_june2.is_working_day)

    def test_sync_skipped_when_payroll_disabled(self):
        """When payroll plugin is disabled, sync gracefully skips without modifying payroll data."""
        self.payroll_plugin.is_enabled = False
        self.payroll_plugin.save()

        result = sync_holidays_between_hr_and_payroll(year=2026)
        self.assertEqual(result['status'], 'skipped')
        self.assertEqual(result['reason'], 'payroll_plugin_disabled')

    def test_signals_safe_when_payroll_disabled(self):
        """When payroll is disabled, PublicHoliday creation does not modify payroll workdays."""
        self.payroll_plugin.is_enabled = False
        self.payroll_plugin.save()

        h = PublicHoliday.objects.create(
            date=date(2026, 6, 1),
            name='Disabled Payroll Holiday',
            is_global=True,
            country_code='AL',
        )
        self.wd_work.refresh_from_db()
        self.assertFalse(self.wd_work.is_holiday)
        self.assertTrue(self.wd_work.is_working_day)

        # Deletion also succeeds safely without errors
        h.delete()


class HolidaySyncEndpointTests(TestCase):
    def setUp(self):
        self.payroll_plugin, _ = Plugin.objects.update_or_create(
            name='payroll',
            defaults={'is_enabled': True, 'verbose_name': 'Payroll', 'version': '1.0.0'},
        )
        self.admin = User.objects.create_superuser(username='sync_adm', password='pwd')
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)
        self.cal = PayrollWorkCalendar.objects.create(
            country='AL', year=2026, is_active=True
        )
        PayrollWorkday.objects.create(
            calendar=self.cal,
            date=date(2026, 1, 1),
            is_holiday=True,
            is_working_day=False,
            holiday_name="New Year's Day",
            standard_hours=Decimal('0'),
        )

    def test_dashboard_sync_payroll_endpoint(self):
        response = self.client.post('/api/dashboard/holidays/sync_payroll/', {'year': 2026})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'success')
        self.assertTrue(PublicHoliday.objects.filter(date=date(2026, 1, 1)).exists())

    def test_dashboard_sync_endpoint_skipped_when_payroll_disabled(self):
        self.payroll_plugin.is_enabled = False
        self.payroll_plugin.save()

        response = self.client.post('/api/dashboard/holidays/sync_payroll/', {'year': 2026})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'skipped')
        self.assertEqual(response.data['reason'], 'payroll_plugin_disabled')

    def test_payroll_calendar_sync_endpoint(self):
        from rest_framework.test import APIRequestFactory, force_authenticate
        from plugins.payroll.viewsets import PayrollWorkCalendarViewSet

        factory = APIRequestFactory()
        request = factory.post(f'/api/plugins/payroll/work-calendar/{self.cal.id}/sync_holidays/')
        force_authenticate(request, user=self.admin)
        response = PayrollWorkCalendarViewSet.as_view({'post': 'sync_holidays'})(
            request, pk=self.cal.id,
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'success')
