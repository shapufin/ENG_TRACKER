"""Reconciliation: whatever happens, balance counters equal the sum of the requests behind them.

A seeded random walk of create / approve / reject / edit / delete / holiday added / holiday removed, checking after
EVERY step that `pending_days` and `used_days` of the current-year row and of the carry-over row equal what the
requests say (their frozen `days_counted` split into `carry_days` and the rest), and that nothing goes negative.
Guards the 2026-11-17 holiday recount (M4) and the shared reserve path against double-counting or drift.
"""
import random
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.dashboard.models.calendar import PublicHoliday
from apps.leave_management.models import LeaveBalance, LeaveRequest

User = get_user_model()
BASE = '/api/leave-management/requests/'
ZERO = Decimal('0')


class BalanceReconciliationTests(TestCase):
    def setUp(self):
        self.emp = User.objects.create_user(username='rc_emp', password='x')
        self.tl = User.objects.create_user(username='rc_tl', password='x', is_staff=True)
        self.current = LeaveBalance.objects.create(
            user=self.emp, leave_type='vacation', year=2026, total_days=22, accrual_start_date=date(2000, 1, 1),
        )
        self.carry = LeaveBalance.objects.create(
            user=self.emp, leave_type='vacation', year=2025, is_carry_over=True, total_days=4,
            expires_at=date(2026, 12, 9),  # inside the walk: the carry part splits by date
        )
        self.emp_api, self.tl_api = APIClient(), APIClient()
        self.emp_api.force_authenticate(self.emp)
        self.tl_api.force_authenticate(self.tl)

    def _assert_reconciled(self, step):
        self.current.refresh_from_db()
        self.carry.refresh_from_db()
        expected = {'cur': {'pending': ZERO, 'approved': ZERO}, 'car': {'pending': ZERO, 'approved': ZERO}}
        for leave in LeaveRequest.objects.filter(user=self.emp, request_type='vacation'):
            if leave.status not in ('pending', 'approved'):
                continue
            counted, carry_part = Decimal(leave.days_counted), Decimal(leave.carry_days or 0)
            self.assertLessEqual(carry_part, counted, f'{step}: carry part larger than the request')
            if leave.balance_id:
                expected['cur'][leave.status] += counted - carry_part
            if leave.carry_balance_id:
                expected['car'][leave.status] += carry_part
        rows = '; '.join(
            f'#{leave_row.pk} {leave_row.status} {leave_row.start_date}..{leave_row.end_date} counted={leave_row.days_counted} bal={leave_row.balance_id} '
            f'carry_bal={leave_row.carry_balance_id} carry={leave_row.carry_days}'
            for leave_row in LeaveRequest.objects.filter(user=self.emp)
        )
        where = f'after {step} [{rows}]'
        self.assertEqual(self.current.pending_days, expected['cur']['pending'], f'current pending {where}')
        self.assertEqual(self.current.used_days, expected['cur']['approved'], f'current used {where}')
        self.assertEqual(self.carry.pending_days, expected['car']['pending'], f'carry pending {where}')
        self.assertEqual(self.carry.used_days, expected['car']['approved'], f'carry used {where}')

    def _random_week_range(self, rng):
        start = date(2026, 12, 1) + timedelta(days=rng.randrange(0, 24))
        while start.weekday() > 4:
            start += timedelta(days=1)
        end = start + timedelta(days=rng.randrange(0, 5))
        while end.weekday() > 4:
            end += timedelta(days=1)
        return start, min(end, date(2026, 12, 31))

    def _walk(self, seed):
        rng = random.Random(seed)
        holidays = []
        for step_no in range(120):
            action = rng.choice(['create', 'create', 'approve', 'reject', 'edit', 'delete', 'holiday', 'unholiday',
                                 'bulk_approve', 'bulk_reject', 'bulk_delete'])
            leaves = list(LeaveRequest.objects.filter(user=self.emp))
            step = f'step {step_no} {action}'
            if action == 'create':
                start, end = self._random_week_range(rng)
                self.emp_api.post(BASE, {
                    'start_date': start.isoformat(), 'end_date': end.isoformat(),
                    'request_type': 'vacation', 'reason': 'r',
                }, format='json')  # 400 on overlap or balance is a valid outcome
            elif action in ('approve', 'reject') and leaves:
                leave = rng.choice(leaves)
                body = {'rejection_reason': 'x'} if action == 'reject' else {}
                self.tl_api.post(f'{BASE}{leave.pk}/{action}/', body, format='json')
            elif action == 'edit' and leaves:
                leave = rng.choice(leaves)
                start, end = self._random_week_range(rng)
                self.emp_api.patch(f'{BASE}{leave.pk}/', {
                    'start_date': start.isoformat(), 'end_date': end.isoformat(),
                }, format='json')
            elif action.startswith('bulk_') and leaves:
                ids = [leave.pk for leave in rng.sample(leaves, k=min(len(leaves), rng.randrange(1, 4)))]
                body = {'ids': ids, **({'rejection_reason': 'x'} if action == 'bulk_reject' else {})}
                self.tl_api.post(f'{BASE}{action}/', body, format='json')
            elif action == 'delete' and leaves:
                self.emp_api.delete(f'{BASE}{rng.choice(leaves).pk}/')
            elif action == 'holiday':
                day = date(2026, 12, 1) + timedelta(days=rng.randrange(0, 30))
                if day.weekday() < 5 and not PublicHoliday.objects.filter(date=day).exists():
                    with self.captureOnCommitCallbacks(execute=True):
                        holidays.append(PublicHoliday.objects.create(name=f'H{step_no}', date=day))
            elif action == 'unholiday' and holidays:
                holiday = holidays.pop(rng.randrange(len(holidays)))
                with self.captureOnCommitCallbacks(execute=True):
                    holiday.delete()
            self._assert_reconciled(step)
            for leave in LeaveRequest.objects.filter(user=self.emp):
                counted = Decimal(leave.days_counted)
                self.assertGreaterEqual(counted, ZERO, step)

    def test_random_walk_keeps_every_counter_equal_to_its_requests(self):
        self._walk(20261117)

    def test_random_walk_with_other_seeds(self):
        for seed in (1, 7, 42, 99):
            LeaveRequest.objects.all().delete()
            PublicHoliday.objects.all().delete()
            LeaveBalance.objects.filter(pk=self.current.pk).update(pending_days=ZERO, used_days=ZERO)
            LeaveBalance.objects.filter(pk=self.carry.pk).update(pending_days=ZERO, used_days=ZERO)
            self._walk(seed)


class EditingADecidedRequestTests(BalanceReconciliationTests):
    """Found by the random walk: editing a rejected request used to leave a phantom pending reservation."""

    test_random_walk_keeps_every_counter_equal_to_its_requests = None  # inherited; runs once in the base class
    test_random_walk_with_other_seeds = None

    def _create(self):
        response = self.emp_api.post(BASE, {
            'start_date': '2026-12-14', 'end_date': '2026-12-17', 'request_type': 'vacation', 'reason': 'r',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return response.data['id']

    def test_editing_a_rejected_request_resubmits_it_with_a_matching_reservation(self):
        leave_id = self._create()
        self.tl_api.post(f'{BASE}{leave_id}/reject/', {'rejection_reason': 'x'}, format='json')
        self._assert_reconciled('reject')

        response = self.emp_api.patch(f'{BASE}{leave_id}/', {'end_date': '2026-12-18'}, format='json')

        self.assertEqual(response.status_code, 200, response.data)
        leave = LeaveRequest.objects.get(pk=leave_id)
        self.assertEqual((leave.status, leave.rejection_reason), ('pending', ''))
        self.assertEqual(float(leave.days_counted), 5.0)
        self._assert_reconciled('edit of a rejected request')

    def test_a_cancelled_request_cannot_be_edited(self):
        leave_id = self._create()
        LeaveRequest.objects.filter(pk=leave_id).update(status='cancelled')
        self.current.pending_days = ZERO
        self.current.save(update_fields=['pending_days'])

        response = self.emp_api.patch(f'{BASE}{leave_id}/', {'end_date': '2026-12-18'}, format='json')

        self.assertEqual(response.status_code, 400, response.data)
        self._assert_reconciled('edit of a cancelled request')
