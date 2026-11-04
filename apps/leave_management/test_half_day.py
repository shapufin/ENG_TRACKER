"""Half-day vacation: 0.5-day counting, morning/afternoon pairing and balance movement."""

from datetime import date
from decimal import Decimal

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIClient

from apps.dashboard.models.calendar import PublicHoliday
from apps.leave_management.models import (
    LeaveBalance,
    LeaveRequest,
    count_leave_days,
    counted_days,
)

REQ = '/api/leave-management/requests/'
MON = date(2026, 3, 9)
TUE = date(2026, 3, 10)
SAT = date(2026, 3, 14)


def half(period='morning', day=MON):
    return {
        'request_type': 'vacation', 'start_date': str(day), 'end_date': str(day),
        'is_half_day': True, 'half_day_period': period,
    }


class HalfDayTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.user = User.objects.create_user(username='hd_user', password='pw')
        self.balance = LeaveBalance.objects.create(
            user=self.user, leave_type='vacation', year=2026, total_days=22,
            accrual_start_date=date(2000, 1, 1),
        )
        self.api.force_authenticate(user=self.user)

    def post(self, body):
        return self.api.post(REQ, body, format='json')

    def used_and_pending(self):
        self.balance.refresh_from_db()
        return self.balance.used_days, self.balance.pending_days

    def test_half_day_counts_one_half(self):
        self.assertEqual(count_leave_days(MON, MON, is_half_day=True), Decimal('0.5'))
        self.assertEqual(count_leave_days(MON, MON), 1)

    def test_half_day_on_weekend_or_holiday_counts_zero(self):
        PublicHoliday.objects.create(name='Global', date=TUE, is_global=True)
        self.assertEqual(count_leave_days(SAT, SAT, is_half_day=True), 0)
        self.assertEqual(count_leave_days(TUE, TUE, is_half_day=True), 0)

    def test_half_day_must_be_a_single_date(self):
        request = LeaveRequest(
            user=self.user, request_type='vacation', start_date=MON, end_date=TUE,
            is_half_day=True, half_day_period='morning',
        )
        with self.assertRaises(ValidationError):
            request.clean()

    def test_half_day_needs_a_period_and_vacation_type(self):
        no_period = LeaveRequest(
            user=self.user, request_type='vacation', start_date=MON, end_date=MON, is_half_day=True,
        )
        with self.assertRaises(ValidationError):
            no_period.clean()
        sick = LeaveRequest(
            user=self.user, request_type='sick', start_date=MON, end_date=MON,
            is_half_day=True, half_day_period='morning',
        )
        with self.assertRaises(ValidationError):
            sick.clean()

    def test_create_snapshots_half_and_reports_it_unrounded(self):
        response = self.post(half())
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()['days_requested'], 0.5)
        self.assertEqual(response.json()['half_day_period'], 'morning')
        self.assertEqual(LeaveRequest.objects.get().days_counted, Decimal('0.5'))
        self.assertEqual(self.used_and_pending(), (Decimal('0'), Decimal('0.5')))

    def test_two_half_days_make_one_full_day(self):
        self.assertEqual(self.post(half('morning')).status_code, 201)
        self.assertEqual(self.post(half('afternoon')).status_code, 201)
        self.assertEqual(self.used_and_pending(), (Decimal('0'), Decimal('1.0')))

    def test_same_period_twice_overlaps(self):
        self.assertEqual(self.post(half('morning')).status_code, 201)
        self.assertEqual(self.post(half('morning')).status_code, 400)

    def test_third_request_on_a_full_halved_day_overlaps(self):
        self.post(half('morning'))
        self.post(half('afternoon'))
        self.assertEqual(self.post(half('morning')).status_code, 400)

    def test_full_day_and_half_day_overlap_both_ways(self):
        self.post({'request_type': 'vacation', 'start_date': str(MON), 'end_date': str(MON)})
        self.assertEqual(self.post(half('afternoon')).status_code, 400)

        other = User.objects.create_user(username='hd_other', password='pw')
        LeaveBalance.objects.create(
            user=other, leave_type='vacation', year=2026, total_days=22,
            accrual_start_date=date(2000, 1, 1),
        )
        self.api.force_authenticate(user=other)
        self.post(half('morning'))
        full = self.post({'request_type': 'vacation', 'start_date': str(MON), 'end_date': str(TUE)})
        self.assertEqual(full.status_code, 400)

    def test_half_day_inside_a_longer_range_overlaps_even_with_a_matching_half(self):
        self.post(half('morning'))
        self.post({'request_type': 'vacation', 'start_date': str(TUE), 'end_date': str(date(2026, 3, 11))})
        # Monday has one morning half; a range covering Monday must still be refused.
        multi = self.post({'request_type': 'vacation', 'start_date': str(MON), 'end_date': str(TUE)})
        self.assertEqual(multi.status_code, 400)

    def test_half_day_api_rejects_a_range_and_a_missing_period(self):
        ranged = half()
        ranged['end_date'] = str(TUE)
        self.assertEqual(self.post(ranged).status_code, 400)
        missing = half()
        del missing['half_day_period']
        self.assertEqual(self.post(missing).status_code, 400)

    def test_insufficient_balance_counts_the_half(self):
        self.balance.used_days = Decimal('21.8')  # accrual is capped at 22, so 0.2 is left
        self.balance.save()
        self.assertEqual(self.post(half()).status_code, 400)

    def test_cancel_returns_exactly_half(self):
        self.post(half())
        request = LeaveRequest.objects.get()
        staff = User.objects.create_user(username='hd_staff', password='pw', is_staff=True)
        self.api.force_authenticate(user=staff)
        self.assertEqual(self.api.post(f'{REQ}{request.pk}/approve/').status_code, 200)
        self.assertEqual(self.used_and_pending(), (Decimal('0.5'), Decimal('0')))
        self.assertEqual(self.api.post(f'{REQ}{request.pk}/reject/', {'reason': 'x'}, format='json').status_code, 200)
        self.assertEqual(self.used_and_pending(), (Decimal('0'), Decimal('0')))

    def test_edit_full_day_to_half_day_moves_the_reservation(self):
        created = self.post({'request_type': 'vacation', 'start_date': str(MON), 'end_date': str(MON)})
        self.assertEqual(self.used_and_pending()[1], Decimal('1'))
        response = self.api.patch(
            f"{REQ}{created.json()['id']}/",
            {'is_half_day': True, 'half_day_period': 'afternoon'}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(LeaveRequest.objects.get().days_counted, Decimal('0.5'))
        self.assertEqual(self.used_and_pending()[1], Decimal('0.5'))

    def test_edit_half_day_to_full_day_clears_the_period(self):
        created = self.post(half())
        response = self.api.patch(
            f"{REQ}{created.json()['id']}/",
            {'is_half_day': False, 'half_day_period': None}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(LeaveRequest.objects.get().days_counted, Decimal('1'))

    def test_preview_split_counts_a_half_day(self):
        response = self.api.post(
            f'{REQ}preview_split/',
            {'start_date': str(MON), 'end_date': str(MON), 'is_half_day': True}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()['days_counted'], 0.5)
        self.assertEqual(response.json()['current_days'], 0.5)

    def test_carry_over_covers_a_half_day_first(self):
        LeaveBalance.objects.create(
            user=self.user, leave_type='vacation', year=2026, total_days=3, is_carry_over=True,
            expires_at=date(2027, 3, 31),
        )
        LeaveBalance.objects.create(
            user=self.user, leave_type='vacation', year=2027, total_days=22,
            accrual_start_date=date(2000, 1, 1),
        )
        self.assertEqual(self.post(half(day=date(2027, 3, 8))).status_code, 201)
        request = LeaveRequest.objects.get()
        self.assertEqual(request.carry_days, Decimal('0.5'))
        self.assertEqual(self.used_and_pending()[1], Decimal('0'))  # the 2026 row is untouched

    def test_counted_days_keeps_halves_for_reports(self):
        self.post(half('morning'))
        self.post(half('afternoon'))
        rows = LeaveRequest.objects.values('request_type', 'start_date', 'end_date', 'days_counted')
        self.assertEqual(sum(counted_days(row) for row in rows), 1)
        self.assertEqual(counted_days({'days_counted': Decimal('0.5')}), 0.5)
        self.assertEqual(counted_days({'days_counted': Decimal('3.0')}), 3)

    def test_excel_export_shows_half_day_amount_and_period(self):
        import io

        import openpyxl

        from apps.reports.services import export_service

        self.post(half('afternoon'))
        content = export_service.export_leave_to_excel(LeaveRequest.objects.all())
        sheet = openpyxl.load_workbook(io.BytesIO(content)).worksheets[0]
        header = [cell.value for cell in sheet[1]]
        row = [cell.value for cell in sheet[2]]
        self.assertEqual(row[header.index('Days')], 0.5)
        self.assertIn('half day', row[header.index('Type')].lower())
        self.assertIn('afternoon', row[header.index('Type')].lower())
