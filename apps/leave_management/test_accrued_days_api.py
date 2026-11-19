"""The balance API reports what has accrued so far, with the same rounding that limits requests."""
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

    def test_a_new_hire_has_accrued_pro_rata_for_partial_month(self):
        # Hired on the 16th of June (15 days out of 30 in June = 0.5 of a month)
        from datetime import date
        b = LeaveBalance.objects.create(
            user=self.emp, leave_type='vacation', year=2026, total_days=22,
            accrual_start_date=date(2026, 6, 16),
        )
        # On June 30: worked 15 days in June -> 0.5 * 1.8 = 0.9 -> rounded up = 1 day
        self.assertEqual(float(b.get_monthly_accrued_days(date(2026, 6, 30))), 1.0)
        # On July 31: June (0.9) + July (1.8) = 2.7 -> rounded up = 3 days
        self.assertEqual(float(b.get_monthly_accrued_days(date(2026, 7, 31))), 3.0)
        # Yearly entitlement until Dec 31: June (0.9) + 6 full months (10.8) = 11.7 -> rounded up = 12 days
        self.assertEqual(float(b.get_yearly_entitlement()), 12.0)
        self.assertEqual(float(b.get_monthly_accrued_days(date(2026, 12, 31))), 12.0)

    def test_a_full_year_hire_accrues_monthly_and_reaches_full_allowance_at_year_end(self):
        from datetime import date
        b = LeaveBalance.objects.create(
            user=self.emp, leave_type='vacation', year=2026, total_days=22,
            accrual_start_date=date(2024, 1, 1),
        )
        # Yearly entitlement for an existing employee is full 22 days
        self.assertEqual(float(b.get_yearly_entitlement()), 22.0)
        # Increases monthly: Jan = 2, Mar = 6, Jun = 11, Nov = 20, Dec 31 = 22
        self.assertEqual(float(b.get_monthly_accrued_days(date(2026, 1, 31))), 2.0)
        self.assertEqual(float(b.get_monthly_accrued_days(date(2026, 3, 31))), 6.0)
        self.assertEqual(float(b.get_monthly_accrued_days(date(2026, 6, 30))), 11.0)
        self.assertEqual(float(b.get_monthly_accrued_days(date(2026, 12, 31))), 22.0)

    def test_live_accrued_balance_reflects_used_and_pending_can_go_negative(self):
        from datetime import date
        b = LeaveBalance.objects.create(
            user=self.emp, leave_type='vacation', year=2026, total_days=22,
            used_days=13, pending_days=0, accrual_start_date=date(2024, 1, 1),
        )
        # On June 30: accrued is 11, used is 13 -> live balance is -2.0 (borrowed from future months)
        self.assertEqual(float(b.get_live_accrued_balance(date(2026, 6, 30))), -2.0)
        # On Dec 31: accrued is 22, used is 13 -> live balance is +9.0
        self.assertEqual(float(b.get_live_accrued_balance(date(2026, 12, 31))), 9.0)

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
