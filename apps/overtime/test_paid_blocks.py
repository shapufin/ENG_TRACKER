"""Overtime entries on one day that start inside the same paid hour share it.

A block opens at the first entry's start and is paid for one hour. An entry that
starts inside the block shares it, and work past the block's end extends it by
whole hours. An entry that starts at or after the end opens a new block.

Approved entries share their block's hours, recalculated on every change until
the entry is paid in a finalized payroll run, which freezes it. Pending entries
show the share they would get.
"""

from datetime import date, time
from decimal import Decimal
from unittest import mock

from django.contrib.auth.models import User
from django.test import SimpleTestCase, TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.overtime.paid_blocks import compute_blocks, split_hours

from .models import Client, OvertimeLog

DAY = date(2026, 10, 24)


def _m(hh, mm=0):
    return hh * 60 + mm


class ComputeBlocksTests(SimpleTestCase):
    def test_entry_starting_inside_the_hour_shares_it(self):
        blocks = compute_blocks([(1, _m(8), _m(8, 30)), (2, _m(8, 31), _m(9))])
        self.assertEqual(len(blocks), 1)
        self.assertEqual((blocks[0].start, blocks[0].end, blocks[0].hours), (_m(8), _m(9), 1))
        self.assertEqual(blocks[0].keys, [1, 2])

    def test_work_past_the_block_extends_it_by_whole_hours(self):
        blocks = compute_blocks([(1, _m(8), _m(8, 20)), (2, _m(8, 50), _m(9, 10))])
        self.assertEqual((blocks[0].end, blocks[0].hours), (_m(10), 2))

    def test_entry_starting_when_the_block_ends_opens_a_new_one(self):
        blocks = compute_blocks([(1, _m(8), _m(9)), (2, _m(9), _m(9, 30))])
        self.assertEqual([b.hours for b in blocks], [1, 1])

    def test_a_long_entry_is_paid_in_whole_hours(self):
        blocks = compute_blocks([(1, _m(8), _m(10, 1))])
        self.assertEqual(blocks[0].hours, 3)

    def test_overnight_entry_runs_past_midnight(self):
        blocks = compute_blocks([(1, _m(23, 30), _m(0, 40))])
        self.assertEqual((blocks[0].start, blocks[0].end, blocks[0].hours), (_m(23, 30), _m(25, 30), 2))

    def test_input_order_does_not_matter(self):
        a = compute_blocks([(2, _m(8, 31), _m(9)), (1, _m(8), _m(8, 30))])
        self.assertEqual((len(a), a[0].hours, a[0].keys), (1, 1, [1, 2]))


class SplitHoursTests(SimpleTestCase):
    def test_two_entries_split_an_hour_in_quarter_hours(self):
        shares = split_hours(Decimal(1), [30, 29])
        self.assertEqual(shares, [Decimal('0.50'), Decimal('0.50')])

    def test_shares_always_add_up_to_the_total(self):
        for weights in ([10] * 6, [20, 40], [5, 55, 30], [1, 1, 1]):
            self.assertEqual(sum(split_hours(Decimal(2), weights)), Decimal(2))

    def test_many_entries_fall_back_to_hundredths(self):
        shares = split_hours(Decimal(1), [10] * 6)
        self.assertEqual(sum(shares), Decimal(1))
        self.assertTrue(all(s > 0 for s in shares))

    def test_zero_total_gives_zero_shares(self):
        self.assertEqual(split_hours(Decimal(0), [30, 30]), [Decimal(0), Decimal(0)])


class SlotShareTests(SimpleTestCase):
    """Each paid hour is shared by the entries that worked inside it."""

    def _shares(self, *entries):
        block = compute_blocks(entries)[0]
        return [dict(zip(block.keys, block.shares(block.keys)))[k] for k, *_ in entries]

    def test_an_extension_hour_goes_to_the_entry_that_caused_it(self):
        shares = self._shares((1, _m(8), _m(8, 30)), (2, _m(8, 40), _m(9, 1)))
        self.assertEqual(shares, [Decimal('0.50'), Decimal('1.50')])

    def test_a_split_hour_is_shared_by_minutes_worked(self):
        shares = self._shares((1, _m(8), _m(8, 30)), (2, _m(8, 31), _m(9)))
        self.assertEqual(shares, [Decimal('0.50'), Decimal('0.50')])

    def test_a_single_entry_gets_the_whole_block(self):
        self.assertEqual(self._shares((1, _m(8), _m(10, 1))), [Decimal('3.00')])

    def test_shares_always_add_up_to_the_block(self):
        shares = self._shares((1, _m(8), _m(8, 10)), (2, _m(8, 20), _m(8, 25)), (3, _m(8, 50), _m(9, 40)))
        self.assertEqual(sum(shares), Decimal(compute_blocks([(1, _m(8), _m(8, 10)), (2, _m(8, 20), _m(8, 25)), (3, _m(8, 50), _m(9, 40))])[0].hours))


class PaidBlockWorkflowTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='block-user', password='x')
        self.other = User.objects.create_user(username='block-other', password='x')
        self.client_a = Client.objects.create(name='Client A', code='PBA')
        self.client_b = Client.objects.create(name='Client B', code='PBB')

    def _log(self, start, end, *, status='pending', user=None, day=DAY, client=None):
        return OvertimeLog.objects.create(
            user=user or self.user, client=client or self.client_a, date=day,
            start_time=start, end_time=end, hours=1, status=status,
        )

    def _approve(self, *logs):
        for log in logs:
            log.refresh_from_db()
            log.status = 'approved'
            log.save()

    def _hours(self, *logs):
        return [OvertimeLog.objects.get(pk=log.pk).hours for log in logs]

    def test_an_entry_that_runs_past_the_hour_carries_the_extra_hour(self):
        a = self._log(time(8, 0), time(8, 30), status='approved')
        b = self._log(time(8, 40), time(9, 1), status='approved')
        self.assertEqual(self._hours(a, b), [Decimal('0.50'), Decimal('1.50')])

    def test_pending_entries_show_the_share_they_would_get(self):
        a = self._log(time(8, 0), time(8, 30))
        b = self._log(time(8, 31), time(9, 0))
        self.assertEqual(self._hours(a, b), [Decimal('0.50'), Decimal('0.50')])

    def test_approving_both_keeps_the_hour_split_between_them(self):
        a = self._log(time(8, 0), time(8, 30))
        b = self._log(time(8, 31), time(9, 0))
        self._approve(a, b)
        self.assertEqual(self._hours(a, b), [Decimal('0.50'), Decimal('0.50')])
        a.refresh_from_db()
        self.assertEqual((a.paid_window_start, a.paid_window_end), (time(8, 0), time(9, 0)))

    def test_approving_one_then_the_other_before_payroll_splits_the_hour(self):
        a = self._log(time(8, 0), time(8, 30))
        b = self._log(time(8, 31), time(9, 0))
        self._approve(a)
        self.assertEqual(self._hours(a)[0], Decimal('1.00'))
        self._approve(b)
        self.assertEqual(self._hours(a, b), [Decimal('0.50'), Decimal('0.50')])

    def test_deleting_one_half_gives_the_other_the_whole_hour(self):
        a = self._log(time(8, 0), time(8, 30), status='approved')
        b = self._log(time(8, 31), time(9, 0), status='approved')
        self.assertEqual(self._hours(a, b), [Decimal('0.50'), Decimal('0.50')])
        b.delete()
        self.assertEqual(self._hours(a)[0], Decimal('1.00'))

    def test_a_pending_sibling_never_changes_what_an_approved_entry_is_paid(self):
        a = self._log(time(8, 0), time(8, 30), status='approved')
        b = self._log(time(8, 31), time(9, 0))
        self.assertEqual(self._hours(a, b), [Decimal('1.00'), Decimal('0.50')])

    def test_rejecting_a_pending_sibling_keeps_the_approved_entry_at_the_whole_hour(self):
        a = self._log(time(8, 0), time(8, 30), status='approved')
        b = self._log(time(8, 31), time(9, 0))
        b.status = 'rejected'
        b.save()
        self.assertEqual(self._hours(a)[0], Decimal('1.00'))

    def test_a_paid_entry_is_frozen_and_the_new_one_gets_only_what_is_left(self):
        a = self._log(time(8, 0), time(8, 30), status='approved')
        self.assertEqual(self._hours(a)[0], Decimal('1.00'))
        b = self._log(time(8, 31), time(9, 0))
        with mock.patch('apps.overtime.paid_blocks.frozen_log_hours', return_value={a.pk: Decimal('1.00')}):
            self._approve(b)
        self.assertEqual(self._hours(a, b), [Decimal('1.00'), Decimal('0.00')])
        b.refresh_from_db()
        self.assertEqual((b.paid_window_start, b.paid_window_end), (time(8, 0), time(9, 0)))

    def test_a_pending_entry_beside_a_paid_one_already_shows_what_is_left(self):
        a = self._log(time(8, 0), time(8, 30), status='approved')
        with mock.patch('apps.overtime.paid_blocks.frozen_log_hours', return_value={a.pk: Decimal('1.00')}):
            b = self._log(time(8, 31), time(9, 0))
        self.assertEqual(self._hours(a, b), [Decimal('1.00'), Decimal('0.00')])

    def test_a_full_save_of_a_paid_entry_does_not_change_its_hours(self):
        a = self._log(time(8, 0), time(8, 30), status='approved')
        self._log(time(8, 31), time(9, 0), status='approved')
        self.assertEqual(self._hours(a)[0], Decimal('0.50'))
        with mock.patch('apps.overtime.paid_blocks.frozen_log_hours', return_value={a.pk: Decimal('0.50')}):
            a.refresh_from_db()
            a.description = 'edited after payment'
            a.save()
        self.assertEqual(self._hours(a)[0], Decimal('0.50'))

    def test_the_left_over_hours_come_from_what_payroll_paid_not_the_log(self):
        a = self._log(time(8, 0), time(8, 30), status='approved')
        b = self._log(time(8, 31), time(9, 0))
        OvertimeLog.objects.filter(pk=a.pk).update(hours=Decimal('0.25'))
        with mock.patch('apps.overtime.paid_blocks.frozen_log_hours', return_value={a.pk: Decimal('1.00')}):
            self._approve(b)
        self.assertEqual(self._hours(a, b), [Decimal('1.00'), Decimal('0.00')])

    def test_a_frozen_entry_keeps_its_window_when_a_sibling_extends_the_block(self):
        a = self._log(time(8, 0), time(8, 20), status='approved')
        before = OvertimeLog.objects.get(pk=a.pk)
        b = self._log(time(8, 50), time(9, 10))
        with mock.patch('apps.overtime.paid_blocks.frozen_log_hours', return_value={a.pk: Decimal('1.00')}):
            self._approve(b)
        after = OvertimeLog.objects.get(pk=a.pk)
        self.assertEqual((after.hours, after.paid_window_end), (before.hours, before.paid_window_end))
        self.assertEqual(self._hours(b)[0], Decimal('1.00'))

    def test_editing_an_approved_entry_back_to_pending_recalculates_the_others(self):
        a = self._log(time(8, 0), time(8, 30), status='approved')
        b = self._log(time(8, 31), time(9, 0), status='approved')
        b.status = 'pending'
        b.save()
        self.assertEqual(self._hours(a)[0], Decimal('1.00'))

    def test_moving_an_entry_to_another_day_recalculates_the_old_day(self):
        a = self._log(time(8, 0), time(8, 30), status='approved')
        b = self._log(time(8, 31), time(9, 0), status='approved')
        b.date = date(2026, 10, 25)
        b.save()
        self.assertEqual(self._hours(a, b), [Decimal('1.00'), Decimal('1.00')])

    def test_entries_of_different_clients_share_the_hour(self):
        a = self._log(time(8, 0), time(8, 30), status='approved')
        b = self._log(time(8, 31), time(9, 0), status='approved', client=self.client_b)
        self.assertEqual(self._hours(a, b), [Decimal('0.50'), Decimal('0.50')])

    def test_two_separate_call_ins_are_paid_separately(self):
        a = self._log(time(8, 0), time(8, 30), status='approved')
        b = self._log(time(20, 0), time(20, 30), status='approved')
        self.assertEqual(self._hours(a, b), [Decimal('1.00'), Decimal('1.00')])

    def test_other_users_and_days_are_not_touched(self):
        a = self._log(time(8, 0), time(8, 30), status='approved')
        self._log(time(8, 31), time(9, 0), status='approved', user=self.other)
        self._log(time(8, 31), time(9, 0), status='approved', day=date(2026, 10, 25))
        self.assertEqual(self._hours(a)[0], Decimal('1.00'))

    def test_an_entry_without_times_keeps_the_hours_typed(self):
        log = OvertimeLog.objects.create(
            user=self.user, client=self.client_a, date=DAY, hours=Decimal('4.00'), status='approved',
        )
        log.refresh_from_db()
        self.assertEqual((log.hours, log.paid_window_start), (Decimal('4.00'), None))

    def test_six_short_calls_in_one_hour_pay_one_hour(self):
        logs = [
            self._log(time(8, k * 10), time(8, k * 10 + 10) if k < 5 else time(9, 0), status='approved')
            for k in range(6)
        ]
        self.assertEqual(sum(self._hours(*logs)), Decimal('1.00'))


class PaidBlockApiTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.user = User.objects.create_user(username='block-api', password='x')
        self.client_a = Client.objects.create(name='Client API', code='PBX')
        self.api.force_authenticate(user=self.user)

    def _post(self, start, end):
        return self.api.post('/api/overtime/logs/', {
            'date': DAY.isoformat(), 'client': self.client_a.id,
            'start_time': start, 'end_time': end,
        })

    def test_api_returns_fractional_hours_and_the_paid_window(self):
        first = self._post('08:00', '08:30')
        second = self._post('08:31', '09:00')
        self.assertEqual(second.status_code, status.HTTP_201_CREATED, second.content)
        self.assertEqual(float(second.data['hours']), 0.5)
        listed = {row['id']: row for row in self.api.get('/api/overtime/logs/?page_size=50').data['results']}
        row = listed[first.data['id']]
        self.assertEqual(row['hours'], 0.5)
        self.assertEqual((row['paid_window_start'], row['paid_window_end']), ('08:00:00', '09:00:00'))
