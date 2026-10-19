"""Year-end carry-over, date-based carry priority, closed-year freeze (plan v2, Tasks 2-4)."""

from datetime import date
from decimal import Decimal
from unittest import mock

from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework.test import APIClient

from apps.leave_management.models import GlobalSettings, LeaveBalance, LeaveRequest
from core.utils.timezone_local import clear_business_tz_cache
from apps.leave_management.services.carry_over import (
    apply_year_end_carry_over,
    carry_over_expiry_for,
    is_closed_year,
)

REQ = '/api/leave-management/requests/'
SETTINGS_URL = '/api/leave-management/settings/{}/'


class CarryOverTestBase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='carry_user', password='pw')
        self.staff = User.objects.create_user(username='carry_staff', password='pw', is_staff=True)
        self.api = APIClient()
        self.settings = GlobalSettings.objects.get_or_create(pk=1)[0]
        self._patcher = None
        self.set_today(date(2026, 10, 13))

    def set_today(self, day):
        """Pin the app's notion of 'today' (timezone.localdate) for this test."""
        if self._patcher:
            self._patcher.stop()
        self._patcher = mock.patch('django.utils.timezone.localdate', return_value=day)
        self._patcher.start()
        self.addCleanup(lambda: self._patcher and self._patcher.stop())

    def balance(self, year, total=22, used=0, pending=0, user=None, carry=False, expires=None):
        # accrual_start_date far in the past gives the full 22-day entitlement at
        # 31 Dec. An empty accrual start would be filled with the hire date (today)
        # by ensure_current_year_balance, which shrinks the balance to a few days.
        return LeaveBalance.objects.create(
            user=user or self.user, leave_type='vacation', year=year, is_carry_over=carry,
            total_days=total, used_days=used, pending_days=pending,
            expires_at=expires, accrual_start_date=date(2000, 1, 1),
        )

    def request(self, start, end, user=None, api=None):
        api = api or self.api
        api.force_authenticate(user=user or self.user)
        return api.post(REQ, {'request_type': 'vacation', 'start_date': str(start),
                              'end_date': str(end)}, format='json')

    def act(self, request_id, action, data=None):
        self.api.force_authenticate(user=self.staff)
        return self.api.post(f'{REQ}{request_id}/{action}/', data or {}, format='json')

    def carry_row(self, year=2026, user=None):
        return LeaveBalance.objects.filter(
            user=user or self.user, leave_type='vacation', is_carry_over=True, year=year,
        ).first()


class RolloverTests(CarryOverTestBase):
    def test_unused_balance_carries_with_settings_expiry(self):
        self.balance(2026, total=22, used=12)
        self.set_today(date(2027, 1, 2))
        apply_year_end_carry_over()
        row = self.carry_row()
        self.assertEqual(row.total_days, Decimal('10'))
        self.assertEqual(row.expires_at, date(2027, 3, 31))

    def test_pending_days_are_reserved_not_carried(self):
        self.balance(2026, total=22, used=0, pending=5)
        self.set_today(date(2027, 1, 2))
        apply_year_end_carry_over()
        self.assertEqual(self.carry_row().total_days, Decimal('17'))

    def test_second_call_in_same_year_is_a_no_op(self):
        self.balance(2026, total=22, used=12)
        self.set_today(date(2027, 1, 2))
        apply_year_end_carry_over()
        counts = apply_year_end_carry_over()
        self.assertEqual(counts, {'created': 0, 'skipped': 0})
        self.assertEqual(LeaveBalance.objects.filter(is_carry_over=True, year=2026).count(), 1)

    def test_switch_off_creates_nothing(self):
        self.settings.carry_over_enabled = False
        self.settings.save()
        self.balance(2026, total=22, used=12)
        self.set_today(date(2027, 1, 2))
        apply_year_end_carry_over()
        self.assertIsNone(self.carry_row())
        self.assertTrue(is_closed_year(2026))

    def test_first_request_of_new_year_triggers_rollover(self):
        self.balance(2026, total=22, used=12)
        self.set_today(date(2027, 1, 2))
        response = self.request(date(2027, 3, 8), date(2027, 3, 8))
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(self.carry_row().total_days, Decimal('10'))

    def test_null_expiry_carry_row_is_rejected(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            LeaveBalance.objects.create(
                user=self.user, leave_type='vacation', year=2026, is_carry_over=True,
                total_days=5, expires_at=None,
            )

    def test_expiry_clamps_feb_29_in_non_leap_year(self):
        self.assertEqual(carry_over_expiry_for(2027, 2, 29), date(2028, 2, 29))
        self.assertEqual(carry_over_expiry_for(2026, 2, 29), date(2027, 2, 28))


class PendingAtYearEndTests(CarryOverTestBase):
    """Decision D4: pending closed-year days are reserved, then settled against the carry."""

    def setUp(self):
        super().setUp()
        self.balance(2026, total=22)
        self.set_today(date(2026, 12, 1))
        # 2026-12-14..18 is Mon-Fri, five vacation days in the closing year.
        self.pending = self.request(date(2026, 12, 14), date(2026, 12, 18)).data['id']
        self.set_today(date(2027, 1, 2))
        apply_year_end_carry_over()

    def test_carry_excludes_pending_days(self):
        self.assertEqual(self.carry_row().total_days, Decimal('17'))

    def test_approving_pending_closed_year_request_leaves_carry_unchanged(self):
        self.act(self.pending, 'approve')
        self.assertEqual(self.carry_row().total_days, Decimal('17'))
        row = LeaveBalance.objects.get(user=self.user, year=2026, is_carry_over=False)
        self.assertEqual((row.used_days, row.pending_days), (Decimal('5'), Decimal('0')))

    def test_rejecting_pending_closed_year_request_returns_days_to_carry(self):
        response = self.act(self.pending, 'reject', {'rejection_reason': 'no'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.carry_row().total_days, Decimal('22'))

    def test_cancelling_approved_closed_year_request_returns_days_to_carry(self):
        self.act(self.pending, 'approve')
        self.api.force_authenticate(user=self.staff)
        response = self.api.delete(f'{REQ}{self.pending}/')
        self.assertIn(response.status_code, (200, 204))
        self.assertEqual(self.carry_row().total_days, Decimal('22'))

    def test_closed_year_rejected_request_cannot_be_reapproved(self):
        self.act(self.pending, 'reject', {'rejection_reason': 'no'})
        response = self.act(self.pending, 'approve')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.carry_row().total_days, Decimal('22'))

    def test_new_request_into_closed_year_is_refused(self):
        response = self.request(date(2026, 12, 21), date(2026, 12, 22))
        self.assertEqual(response.status_code, 400)


class CarryPriorityTests(CarryOverTestBase):
    def setUp(self):
        super().setUp()
        self.balance(2026, total=22, used=12)      # carry 10, expires 2027-03-31
        self.set_today(date(2027, 1, 2))
        apply_year_end_carry_over()
        self.balance(2027, total=22)
        self.set_today(date(2027, 2, 1))

    def row(self, year, carry=False):
        return LeaveBalance.objects.get(user=self.user, year=year, is_carry_over=carry)

    def test_carry_used_first_within_its_window(self):
        # Mon 8 Mar - Fri 12 Mar 2027: five weekdays, all before 31 Mar.
        response = self.request(date(2027, 3, 8), date(2027, 3, 12))
        self.assertEqual(response.status_code, 201, response.content)
        req = LeaveRequest.objects.get(pk=response.data['id'])
        self.assertEqual((req.carry_days, req.days_counted), (Decimal('5'), Decimal('5')))
        self.assertEqual(self.carry_row().pending_days, Decimal('5'))
        self.assertEqual(self.row(2027).pending_days, Decimal('0'))

    def test_booking_after_expiry_uses_current_year_only(self):
        # Mon 5 Apr - Fri 9 Apr 2027 is after the expiry: carry stays untouched.
        response = self.request(date(2027, 4, 5), date(2027, 4, 9))
        self.assertEqual(response.status_code, 201, response.content)
        req = LeaveRequest.objects.get(pk=response.data['id'])
        self.assertEqual(req.carry_days, Decimal('0'))
        self.assertEqual(self.row(2027).pending_days, Decimal('5'))

    def test_request_crossing_expiry_splits_by_date(self):
        # Mon 29 Mar - Fri 2 Apr: 29, 30, 31 Mar are carry; 1, 2 Apr are current year.
        response = self.request(date(2027, 3, 29), date(2027, 4, 2))
        self.assertEqual(response.status_code, 201, response.content)
        req = LeaveRequest.objects.get(pk=response.data['id'])
        self.assertEqual((req.carry_days, req.days_counted), (Decimal('3'), Decimal('5')))
        self.assertEqual(self.row(2027).pending_days, Decimal('2'))

    def test_carry_capped_at_remaining_balance(self):
        LeaveBalance.objects.filter(user=self.user, year=2026, is_carry_over=True).update(total_days=3)
        response = self.request(date(2027, 3, 8), date(2027, 3, 12))
        req = LeaveRequest.objects.get(pk=response.data['id'])
        self.assertEqual((req.carry_days, req.days_counted), (Decimal('3'), Decimal('5')))
        self.assertEqual(self.row(2027).pending_days, Decimal('2'))

    def test_reject_restores_both_parts(self):
        response = self.request(date(2027, 3, 8), date(2027, 3, 12))
        self.act(response.data['id'], 'reject', {'rejection_reason': 'no'})
        self.assertEqual(self.carry_row().pending_days, Decimal('0'))
        self.assertEqual(self.carry_row().total_days, Decimal('10'))
        self.assertEqual(self.row(2027).pending_days, Decimal('0'))

    def test_approve_moves_carry_pending_to_used(self):
        response = self.request(date(2027, 3, 8), date(2027, 3, 12))
        self.act(response.data['id'], 'approve')
        self.assertEqual(self.carry_row().used_days, Decimal('5'))
        self.assertEqual(self.carry_row().pending_days, Decimal('0'))

    def test_insufficient_total_is_refused_with_split_message(self):
        # After expiry only the current year can pay; a 1-day current balance cannot cover 5 days.
        LeaveBalance.objects.filter(user=self.user, year=2027).update(used_days=21)
        response = self.request(date(2027, 4, 5), date(2027, 4, 9))
        self.assertEqual(response.status_code, 400)
        self.assertIn('2027 balance', str(response.data))

    def test_preview_rejects_impossible_date_with_400(self):
        self.api.force_authenticate(user=self.user)
        response = self.api.post(f'{REQ}preview_split/', {
            'start_date': '2027-02-30', 'end_date': '2027-03-02',
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_preview_split_matches_deduction(self):
        self.api.force_authenticate(user=self.user)
        preview = self.api.post(f'{REQ}preview_split/', {
            'start_date': '2027-03-29', 'end_date': '2027-04-02',
        }, format='json')
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.data['carry_days'], 3.0)
        self.assertEqual(preview.data['current_days'], 2.0)


class SettingsTests(CarryOverTestBase):
    url = SETTINGS_URL

    def test_changing_expiry_restamps_existing_carry(self):
        self.balance(2026, total=22, used=12)
        self.set_today(date(2027, 1, 2))
        apply_year_end_carry_over()
        self.api.force_authenticate(user=self.staff)
        response = self.api.patch(self.url.format(self.settings.pk), {
            'carry_over_expiry_month': 4, 'carry_over_expiry_day': 30,
        }, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self.carry_row().expires_at, date(2027, 4, 30))

    def test_business_timezone_is_editable_and_exposed(self):
        self.addCleanup(clear_business_tz_cache)  # rollback fires no signals
        self.api.force_authenticate(user=self.staff)
        response = self.api.patch(self.url.format(self.settings.pk), {
            'business_timezone': 'Europe/Rome',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data['business_timezone'], 'Europe/Rome')

    def test_unknown_business_timezone_is_rejected(self):
        self.api.force_authenticate(user=self.staff)
        response = self.api.patch(self.url.format(self.settings.pk), {
            'business_timezone': 'Mars/Olympus',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('business_timezone', response.data)

    def test_day_that_does_not_exist_is_rejected(self):
        self.api.force_authenticate(user=self.staff)
        response = self.api.patch(self.url.format(self.settings.pk), {
            'carry_over_expiry_month': 2, 'carry_over_expiry_day': 31,
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_changing_expiry_does_not_revive_an_already_expired_carry(self):
        # 2025 carry expired on 31 Mar 2026. Moving the rule must not bring it back.
        old = self.balance(2025, total=10, used=0, carry=True, expires=date(2026, 3, 31))
        self.balance(2026, total=22, used=12)
        self.set_today(date(2027, 1, 2))
        apply_year_end_carry_over()
        self.api.force_authenticate(user=self.staff)
        response = self.api.patch(self.url.format(self.settings.pk), {
            'carry_over_expiry_month': 4, 'carry_over_expiry_day': 30,
        }, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        old.refresh_from_db()
        self.assertEqual(old.expires_at, date(2026, 3, 31))
        self.assertEqual(self.carry_row().expires_at, date(2027, 4, 30))

    def test_switch_is_exposed_and_editable(self):
        self.api.force_authenticate(user=self.staff)
        response = self.api.patch(self.url.format(self.settings.pk), {'carry_over_enabled': False}, format='json')
        self.assertEqual(response.status_code, 200)
        self.settings.refresh_from_db()
        self.assertFalse(self.settings.carry_over_enabled)

    def test_month_and_day_bounds_rejected(self):
        self.api.force_authenticate(user=self.staff)
        for invalid_payload in [
            {'carry_over_expiry_month': 0},
            {'carry_over_expiry_month': 13},
            {'carry_over_expiry_day': 0},
            {'carry_over_expiry_day': 32},
            {'default_yearly_leave_days': -1},
            {'default_yearly_leave_days': 400},
        ]:
            response = self.api.patch(self.url.format(self.settings.pk), invalid_payload, format='json')
            self.assertEqual(response.status_code, 400, f'Expected 400 for {invalid_payload}')

    def test_re_stamping_when_applied_year_is_none(self):
        # Even before rollover has marked carry_over_applied_year,
        # carry rows for the prior calendar year are re-stamped when settings change.
        self.settings.carry_over_applied_year = None
        self.settings.save(update_fields=['carry_over_applied_year'])
        self.set_today(date(2027, 2, 1))
        # Prior year carry row
        carry = self.balance(2026, total=10, used=0, carry=True, expires=date(2027, 3, 31))
        self.api.force_authenticate(user=self.staff)
        response = self.api.patch(self.url.format(self.settings.pk), {
            'carry_over_expiry_month': 4, 'carry_over_expiry_day': 30,
        }, format='json')
        self.assertEqual(response.status_code, 200)
        carry.refresh_from_db()
        self.assertEqual(carry.expires_at, date(2027, 4, 30))


class BalanceUpdateBugTests(CarryOverTestBase):
    def test_edit_that_fits_only_after_releasing_old_days_is_accepted(self):
        # 5 days left. Request 5 days (Mon 2 Nov - Fri 6 Nov 2026), then shorten to 4.
        # Old code validated before releasing the old 5 pending days and refused.
        self.balance(2026, total=22, used=17)
        self.set_today(date(2026, 10, 13))
        response = self.request(date(2026, 11, 2), date(2026, 11, 6))
        self.assertEqual(response.status_code, 201, response.content)
        self.api.force_authenticate(user=self.user)
        edit = self.api.patch(f"{REQ}{response.data['id']}/", {'end_date': '2026-11-05'}, format='json')
        self.assertEqual(edit.status_code, 200, edit.content)
        row = LeaveBalance.objects.get(user=self.user, year=2026)
        self.assertEqual(row.pending_days, Decimal('4'))
