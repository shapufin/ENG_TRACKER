"""Report insights must not invent numbers: no range means no comparison."""
from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.leave_management.models import LeaveBalance
from apps.users.models import UserProfile

URL = '/api/reports/insights/'


def make_user(name, **kwargs):
    user = User.objects.create_user(name, password='x', **kwargs)
    UserProfile.objects.get_or_create(user=user)
    return user


class InsightsTests(APITestCase):
    def setUp(self):
        self.hr = make_user('ins_hr')
        self.hr.profile.is_hr_user = True
        self.hr.profile.save(update_fields=['is_hr_user'])
        self.client.force_authenticate(self.hr)
        self.emp = make_user('ins_emp')
        LeaveBalance.objects.create(
            user=self.emp, leave_type='vacation', year=2026,
            total_days=Decimal('20'), used_days=Decimal('5'),
        )

    def test_without_a_date_range_there_is_no_comparison(self):
        res = self.client.get(URL)
        self.assertEqual(res.status_code, 200, res.data)
        self.assertIsNone(res.data['overtime_increase'])

    def test_leave_utilization_uses_real_balances_not_a_twenty_day_guess(self):
        res = self.client.get(URL)
        # 5 used of 20 allocated for 2026 (business_today is 2026-10-31 in the fixture clock).
        self.assertEqual(res.data['leave_utilization'], 25.0)

    def test_standby_is_reported_as_hours(self):
        res = self.client.get(URL)
        self.assertEqual(res.data['standby_hours'], 0.0)
        self.assertNotIn('standby_coverage', res.data)

    def test_soft_deleted_balances_are_not_counted(self):
        other = make_user('ins_deleted_balance')
        LeaveBalance.objects.create(
            user=other, leave_type='vacation', year=2026,
            total_days=Decimal('20'), used_days=Decimal('20'), is_deleted=True,
        )
        res = self.client.get(URL)
        self.assertEqual(res.data['leave_utilization'], 25.0)

    def test_deactivated_accounts_are_not_counted(self):
        other = make_user('ins_inactive_balance')
        other.is_active = False
        other.save(update_fields=['is_active'])
        LeaveBalance.objects.create(
            user=other, leave_type='vacation', year=2026,
            total_days=Decimal('20'), used_days=Decimal('20'),
        )
        res = self.client.get(URL)
        self.assertEqual(res.data['leave_utilization'], 25.0)

    def test_a_regular_employee_sees_only_their_own_utilization(self):
        # Scoped like every other report row: an employee must not read the
        # company-wide allocation figure out of the insights card.
        other = make_user('ins_other_emp')
        LeaveBalance.objects.create(
            user=other, leave_type='vacation', year=2026,
            total_days=Decimal('20'), used_days=Decimal('20'),
        )
        self.client.force_authenticate(self.emp)
        res = self.client.get(URL)
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['leave_utilization'], 25.0)
