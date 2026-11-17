"""The balance API reports what has accrued so far, with the same rounding that limits requests."""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.leave_management.models import LeaveBalance
from core.utils.timezone_local import business_today

User = get_user_model()


class AccruedDaysTests(TestCase):
    def setUp(self):
        self.emp = User.objects.create_user(username='ac_emp', password='x')
        self.api = APIClient()
        self.api.force_authenticate(user=self.emp)
        self.year = business_today().year

    def _row(self):
        response = self.api.get('/api/leave-management/balances/')
        self.assertEqual(response.status_code, 200)
        rows = response.data['results'] if isinstance(response.data, dict) else response.data
        return next(r for r in rows if not r['is_carry_over'])

    def test_a_new_hire_has_accrued_one_month_rounded_up(self):
        LeaveBalance.objects.create(
            user=self.emp, leave_type='vacation', year=self.year, total_days=22, accrual_start_date=business_today(),
        )
        self.assertEqual(float(self._row()['accrued_days']), 2.0)  # 1.8 rounded up
        self.assertEqual(float(self._row()['effective_available_days']), 2.0)

    def test_a_full_year_hire_has_accrued_the_whole_allowance(self):
        LeaveBalance.objects.create(
            user=self.emp, leave_type='vacation', year=self.year, total_days=22,
            accrual_start_date=business_today() - timedelta(days=800),
        )
        self.assertEqual(float(self._row()['accrued_days']), 22.0)

    def test_without_an_accrual_start_the_whole_allowance_counts_as_accrued(self):
        LeaveBalance.objects.create(user=self.emp, leave_type='vacation', year=self.year, total_days=22)
        self.assertEqual(float(self._row()['accrued_days']), 22.0)


class RolloverOnTheAdminListTests(TestCase):
    """The admin balances list can be the first read of a new year: it must roll the year over."""

    def test_listing_balances_in_a_new_year_creates_the_carry_over_rows(self):
        from datetime import date
        from unittest import mock

        from apps.leave_management.models import GlobalSettings

        settings_obj, _ = GlobalSettings.objects.get_or_create(pk=1)
        settings_obj.carry_over_enabled = True
        settings_obj.save()
        emp = User.objects.create_user(username='ro_emp', password='x')
        admin = User.objects.create_user(username='ro_admin', password='x', is_staff=True)
        LeaveBalance.objects.create(
            user=emp, leave_type='vacation', year=2026, total_days=22, used_days=10,
            accrual_start_date=date(2000, 1, 1),
        )
        api = APIClient()
        api.force_authenticate(user=admin)

        with mock.patch('apps.leave_management.services.carry_over.business_today', return_value=date(2027, 1, 4)):
            response = api.get('/api/leave-management/balances/')

        self.assertEqual(response.status_code, 200)
        carry = LeaveBalance.objects.get(user=emp, is_carry_over=True)
        self.assertEqual(carry.total_days, 12)
