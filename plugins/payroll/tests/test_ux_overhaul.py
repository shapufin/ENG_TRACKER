"""Tests for Payroll UX overhaul features: dual standby rates, bulk wages,
eligible users, configuration choices, per-user generate, holiday CRUD."""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from plugins.payroll.models import (
    PayrollConfiguration,
    PayrollRuleSet,
    PayrollRun,
    WageAssignment,
)
from plugins.payroll.services.payroll_service import generate_draft_run, regenerate_single_line
from plugins.payroll.services.calculator import (
    PayrollCalculationInput,
    StandbyEntryInput,
    calculate_payroll,
)
from plugins.payroll.viewsets import (
    PayrollConfigurationViewSet,
    WageAssignmentViewSet,
    PayrollRunViewSet,
    PayrollWorkCalendarViewSet,
)

User = get_user_model()


class DualStandbyRateTests(TestCase):
    """Feature 3: Dual standby rates (weekday + weekend, holidays use weekday)."""

    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser(
            username='dual_admin', email='dual@example.com', password='pass',
        )
        cls.employee = User.objects.create_user(
            username='dual_employee', email='emp@example.com', password='pass',
        )
        WageAssignment.objects.create(
            user=cls.employee,
            gross_monthly_wage=Decimal('100000'),
            effective_from=date(2026, 1, 1),
        )
        from django.core.management import call_command
        call_command('seed_payroll_rules', verbosity=0)

    def test_config_has_dual_standby_fields(self):
        config = PayrollConfiguration.get_singleton()
        self.assertTrue(hasattr(config, 'weekday_standby_hourly_rate'))
        self.assertTrue(hasattr(config, 'weekend_standby_hourly_rate'))
        self.assertFalse(hasattr(config, 'default_standby_hourly_rate'))

    def test_weekday_standby_uses_weekday_rate(self):
        """Standby on a Wednesday uses the weekday rate."""
        config = PayrollConfiguration.get_singleton()
        config.weekday_standby_hourly_rate = Decimal('100')
        config.weekend_standby_hourly_rate = Decimal('200')
        config.save()
        # Jan 7, 2026 is a Wednesday
        standby = [StandbyEntryInput(date=date(2026, 1, 7), hours=Decimal('10'))]
        inp = PayrollCalculationInput(
            user_id=1, user_display='Test', year=2026, month=1,
            gross_monthly_wage=Decimal('100000'),
            monthly_working_days=22, monthly_standard_hours=Decimal('174'),
            standby_entries=standby,
            weekday_standby_rate=Decimal('100'),
            weekend_standby_rate=Decimal('200'),
        )
        result = calculate_payroll(inp)
        self.assertEqual(result.standby_hours, Decimal('10'))
        self.assertEqual(result.standby_amount, Decimal('1000'))  # 10h * 100

    def test_saturday_standby_uses_weekday_rate(self):
        """Standby on a Saturday uses the weekday rate for this company."""
        # Jan 10, 2026 is a Saturday
        standby = [StandbyEntryInput(date=date(2026, 1, 10), hours=Decimal('10'))]
        inp = PayrollCalculationInput(
            user_id=1, user_display='Test', year=2026, month=1,
            gross_monthly_wage=Decimal('100000'),
            monthly_working_days=22, monthly_standard_hours=Decimal('174'),
            standby_entries=standby,
            weekday_standby_rate=Decimal('100'),
            weekend_standby_rate=Decimal('200'),
        )
        result = calculate_payroll(inp)
        self.assertEqual(result.standby_hours, Decimal('10'))
        self.assertEqual(result.standby_amount, Decimal('1000'))  # 10h * 100

    def test_holiday_standby_uses_weekday_rate(self):
        """Standby on a holiday uses the weekday rate (per user decision)."""
        # Jan 1, 2026 is New Year's Day (holiday) and also a Thursday
        holiday_dates = {date(2026, 1, 1)}
        standby = [StandbyEntryInput(date=date(2026, 1, 1), hours=Decimal('8'))]
        inp = PayrollCalculationInput(
            user_id=1, user_display='Test', year=2026, month=1,
            gross_monthly_wage=Decimal('100000'),
            monthly_working_days=22, monthly_standard_hours=Decimal('174'),
            standby_entries=standby,
            weekday_standby_rate=Decimal('100'),
            weekend_standby_rate=Decimal('200'),
            holiday_dates=holiday_dates,
        )
        result = calculate_payroll(inp)
        self.assertEqual(result.standby_amount, Decimal('800'))  # 8h * 100 (weekday rate)

    def test_holiday_on_weekend_uses_weekday_rate_not_weekend(self):
        """Standby on a holiday that falls on a weekend must use the weekday
        rate, NOT the weekend rate. This verifies the holiday detection logic
        actually overrides the weekend check."""
        # Jan 4, 2026 is a Sunday — mark it as a holiday
        holiday_dates = {date(2026, 1, 4)}
        standby = [StandbyEntryInput(date=date(2026, 1, 4), hours=Decimal('10'))]
        inp = PayrollCalculationInput(
            user_id=1, user_display='Test', year=2026, month=1,
            gross_monthly_wage=Decimal('100000'),
            monthly_working_days=22, monthly_standard_hours=Decimal('174'),
            standby_entries=standby,
            weekday_standby_rate=Decimal('100'),
            weekend_standby_rate=Decimal('200'),
            holiday_dates=holiday_dates,
        )
        result = calculate_payroll(inp)
        # Should use weekday rate (100) because it's a holiday, not weekend rate (200)
        self.assertEqual(result.standby_amount, Decimal('1000'))  # 10h * 100

    def test_sunday_uses_weekend_rate(self):
        """Standby on a regular Sunday (not a holiday) uses the weekend rate."""
        # Jan 11, 2026 is a Sunday, NOT a holiday
        holiday_dates = set()
        standby = [StandbyEntryInput(date=date(2026, 1, 11), hours=Decimal('10'))]
        inp = PayrollCalculationInput(
            user_id=1, user_display='Test', year=2026, month=1,
            gross_monthly_wage=Decimal('100000'),
            monthly_working_days=22, monthly_standard_hours=Decimal('174'),
            standby_entries=standby,
            weekday_standby_rate=Decimal('100'),
            weekend_standby_rate=Decimal('200'),
            holiday_dates=holiday_dates,
        )
        result = calculate_payroll(inp)
        self.assertEqual(result.standby_amount, Decimal('2000'))  # 10h * 200


class ConfigurationChoicesTests(TestCase):
    """Feature 2: Configuration choices endpoint."""

    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser(
            username='choices_admin', email='choices@example.com', password='pass',
        )

    def setUp(self):
        self.factory = APIRequestFactory()

    def test_choices_endpoint_returns_all_choice_fields(self):
        request = self.factory.get('/api/plugins/payroll/configuration/choices/')
        force_authenticate(request, user=self.admin)
        response = PayrollConfigurationViewSet.as_view({'get': 'choices'})(request)
        self.assertEqual(response.status_code, 200)
        self.assertIn('currency', response.data)
        self.assertIn('country', response.data)
        self.assertIn('default_tax_profile', response.data)
        self.assertIn('rounding_mode', response.data)
        self.assertIn('monthly_hours_strategy', response.data)
        self.assertIn('missing_timestamp_fallback_category', response.data)
        # Verify currency has ALL/EUR/USD options
        currency_values = [c['value'] for c in response.data['currency']]
        self.assertIn('ALL', currency_values)
        self.assertIn('EUR', currency_values)


class BulkWageCreateTests(TestCase):
    """Feature 1: Bulk wage creation + eligible users endpoint."""

    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser(
            username='bulk_admin', email='bulk@example.com', password='pass',
        )
        cls.emp1 = User.objects.create_user(
            username='bulk_emp1', email='e1@example.com', password='pass',
        )
        cls.emp2 = User.objects.create_user(
            username='bulk_emp2', email='e2@example.com', password='pass',
        )

    def setUp(self):
        self.factory = APIRequestFactory()

    def test_eligible_users_returns_active_users(self):
        request = self.factory.get('/api/plugins/payroll/wages/eligible_users/')
        force_authenticate(request, user=self.admin)
        response = WageAssignmentViewSet.as_view({'get': 'eligible_users'})(request)
        self.assertEqual(response.status_code, 200)
        usernames = [u['username'] for u in response.data]
        self.assertIn('bulk_emp1', usernames)
        self.assertIn('bulk_emp2', usernames)
        # All should have has_active_wage field
        for u in response.data:
            self.assertIn('has_active_wage', u)
            self.assertIn('current_wage', u)

    def test_bulk_create_wages_success(self):
        payload = {
            'assignments': [
                {'user': self.emp1.id, 'gross_monthly_wage': '100000',
                 'effective_from': '2026-01-01'},
                {'user': self.emp2.id, 'gross_monthly_wage': '120000',
                 'effective_from': '2026-01-01'},
            ],
        }
        request = self.factory.post(
            '/api/plugins/payroll/wages/bulk_create/', payload, format='json',
        )
        force_authenticate(request, user=self.admin)
        response = WageAssignmentViewSet.as_view({'post': 'bulk_create'})(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['created'], 2)
        self.assertEqual(len(response.data['errors']), 0)
        self.assertTrue(
            WageAssignment.objects.filter(user=self.emp1, gross_monthly_wage=Decimal('100000')).exists()
        )
        self.assertTrue(
            WageAssignment.objects.filter(user=self.emp2, gross_monthly_wage=Decimal('120000')).exists()
        )

    def test_bulk_create_rejects_invalid_entries(self):
        wage_count_before = WageAssignment.objects.count()
        payload = {
            'assignments': [
                {'user': self.emp1.id, 'gross_monthly_wage': '-50',
                 'effective_from': '2026-01-01'},
            ],
        }
        request = self.factory.post(
            '/api/plugins/payroll/wages/bulk_create/', payload, format='json',
        )
        force_authenticate(request, user=self.admin)
        response = WageAssignmentViewSet.as_view({'post': 'bulk_create'})(request)
        self.assertEqual(response.status_code, 400)
        self.assertGreater(len(response.data['errors']), 0)
        # Verify no wages were created (atomic rollback)
        self.assertEqual(WageAssignment.objects.count(), wage_count_before)

    def test_bulk_create_rejects_duplicate_users(self):
        """Same user twice with same effective_from should be rejected."""
        payload = {
            'assignments': [
                {'user': self.emp1.id, 'gross_monthly_wage': '100000',
                 'effective_from': '2026-01-01'},
                {'user': self.emp1.id, 'gross_monthly_wage': '120000',
                 'effective_from': '2026-01-01'},
            ],
        }
        request = self.factory.post(
            '/api/plugins/payroll/wages/bulk_create/', payload, format='json',
        )
        force_authenticate(request, user=self.admin)
        response = WageAssignmentViewSet.as_view({'post': 'bulk_create'})(request)
        self.assertEqual(response.status_code, 400)
        self.assertIn('Duplicate', str(response.data['detail']))

    def test_bulk_create_rejects_empty_list(self):
        payload = {'assignments': []}
        request = self.factory.post(
            '/api/plugins/payroll/wages/bulk_create/', payload, format='json',
        )
        force_authenticate(request, user=self.admin)
        response = WageAssignmentViewSet.as_view({'post': 'bulk_create'})(request)
        self.assertEqual(response.status_code, 400)


class PerUserGenerateTests(TestCase):
    """Feature 5: Per-user payroll line generation."""

    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser(
            username='pgen_admin', email='pgen@example.com', password='pass',
        )
        cls.employee = User.objects.create_user(
            username='pgen_employee', email='pe@example.com', password='pass',
        )
        WageAssignment.objects.create(
            user=cls.employee,
            gross_monthly_wage=Decimal('100000'),
            effective_from=date(2026, 1, 1),
        )
        from django.core.management import call_command
        call_command('seed_payroll_rules', verbosity=0)

    def setUp(self):
        self.factory = APIRequestFactory()

    def _new_run(self):
        rule_set = PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE')
        run = PayrollRun.objects.create(
            year=2026, month=3, status='draft', rule_set=rule_set,
            created_by=self.admin,
        )
        return run

    def test_generate_line_creates_single_line(self):
        run = self._new_run()
        request = self.factory.post(
            f'/api/plugins/payroll/runs/{run.id}/generate_line/',
            {'user_id': self.employee.id}, format='json',
        )
        force_authenticate(request, user=self.admin)
        response = PayrollRunViewSet.as_view({'post': 'generate_line'})(
            request, pk=run.id,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'generated')
        self.assertEqual(run.lines.count(), 1)
        self.assertEqual(run.lines.first().user, self.employee)

    def test_generate_line_rejects_finalized_run(self):
        run = self._new_run()
        generate_draft_run(run, [self.employee])
        from plugins.payroll.services.payroll_service import finalize_run
        finalize_run(run, self.admin)
        request = self.factory.post(
            f'/api/plugins/payroll/runs/{run.id}/generate_line/',
            {'user_id': self.employee.id}, format='json',
        )
        force_authenticate(request, user=self.admin)
        response = PayrollRunViewSet.as_view({'post': 'generate_line'})(
            request, pk=run.id,
        )
        self.assertEqual(response.status_code, 400)

    def test_generate_line_rejects_cancelled_run(self):
        run = self._new_run()
        run.status = 'cancelled'
        run.save(update_fields=['status'])
        request = self.factory.post(
            f'/api/plugins/payroll/runs/{run.id}/generate_line/',
            {'user_id': self.employee.id}, format='json',
        )
        force_authenticate(request, user=self.admin)
        response = PayrollRunViewSet.as_view({'post': 'generate_line'})(
            request, pk=run.id,
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('cancelled', response.data['detail'])

    def test_regenerate_single_line_replaces_existing(self):
        run = self._new_run()
        generate_draft_run(run, [self.employee])
        old_line_id = run.lines.get(user=self.employee).id
        # Regenerate
        regenerate_single_line(run, self.employee)
        # Verify old line is deleted and only one line exists
        self.assertEqual(run.lines.count(), 1)
        new_line = run.lines.get(user=self.employee)
        self.assertNotEqual(new_line.id, old_line_id)
        # Verify the line has correct calculated content
        self.assertEqual(new_line.gross_monthly_wage, Decimal('100000'))
        self.assertEqual(new_line.user, self.employee)


class HolidayCRUDTests(TestCase):
    """Feature 6: Holiday add/update/remove on work calendar."""

    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser(
            username='hol_admin', email='hol@example.com', password='pass',
        )
        from plugins.payroll.services.calendar_service import seed_albania_2026
        cls.calendar = seed_albania_2026()

    def setUp(self):
        self.factory = APIRequestFactory()

    def test_add_holiday(self):
        """Adding a holiday sets is_holiday=True, is_working_day=False."""
        from plugins.payroll.services.calendar_service import add_holiday
        # Nov 26 is not a standard holiday
        workday = add_holiday(self.calendar, date(2026, 11, 26), 'Test Holiday')
        self.assertTrue(workday.is_holiday)
        self.assertFalse(workday.is_working_day)
        self.assertEqual(workday.holiday_name, 'Test Holiday')

    def test_add_holiday_via_api(self):
        payload = {'date': '2026-11-26', 'name': 'API Test Holiday'}
        request = self.factory.post(
            f'/api/plugins/payroll/work-calendar/{self.calendar.id}/holidays/add/',
            payload, format='json',
        )
        force_authenticate(request, user=self.admin)
        response = PayrollWorkCalendarViewSet.as_view({'post': 'add_holiday'})(
            request, pk=self.calendar.id,
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['holiday_name'], 'API Test Holiday')

    def test_add_holiday_rejects_wrong_year(self):
        payload = {'date': '2027-01-01', 'name': 'Wrong Year'}
        request = self.factory.post(
            f'/api/plugins/payroll/work-calendar/{self.calendar.id}/holidays/add/',
            payload, format='json',
        )
        force_authenticate(request, user=self.admin)
        response = PayrollWorkCalendarViewSet.as_view({'post': 'add_holiday'})(
            request, pk=self.calendar.id,
        )
        self.assertEqual(response.status_code, 400)

    def test_remove_holiday_restores_working_day(self):
        """Removing a holiday from a weekday restores it as a working day."""
        from plugins.payroll.services.calendar_service import add_holiday, remove_holiday
        # Nov 26, 2026 is a Thursday (weekday)
        workday = add_holiday(self.calendar, date(2026, 11, 26), 'Temp Holiday')
        self.assertFalse(workday.is_working_day)
        remove_holiday(workday)
        workday.refresh_from_db()
        self.assertFalse(workday.is_holiday)
        self.assertTrue(workday.is_working_day)
        self.assertEqual(workday.holiday_name, '')

    def test_remove_holiday_via_api(self):
        from plugins.payroll.services.calendar_service import add_holiday
        workday = add_holiday(self.calendar, date(2026, 11, 27), 'To Remove')
        request = self.factory.delete(
            f'/api/plugins/payroll/work-calendar/{self.calendar.id}/holidays/{workday.id}/remove/',
        )
        force_authenticate(request, user=self.admin)
        response = PayrollWorkCalendarViewSet.as_view({'delete': 'remove_holiday'})(
            request, pk=self.calendar.id, workday_id=workday.id,
        )
        self.assertEqual(response.status_code, 200)
        workday.refresh_from_db()
        self.assertFalse(workday.is_holiday)

    def test_update_holiday_name_via_api(self):
        from plugins.payroll.services.calendar_service import add_holiday
        workday = add_holiday(self.calendar, date(2026, 11, 28), 'Original Name')
        request = self.factory.patch(
            f'/api/plugins/payroll/work-calendar/{self.calendar.id}/holidays/{workday.id}/update/',
            {'name': 'Updated Name'}, format='json',
        )
        force_authenticate(request, user=self.admin)
        response = PayrollWorkCalendarViewSet.as_view({'patch': 'update_holiday'})(
            request, pk=self.calendar.id, workday_id=workday.id,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['holiday_name'], 'Updated Name')
