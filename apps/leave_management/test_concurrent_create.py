"""M6 (audit 2026-11-16): creating leave, overtime or standby takes the person lock BEFORE it validates.

Two checks:
- everywhere: the lock is taken first and inside the writing transaction (order test);
- PostgreSQL only (the CI `backend-postgres` job): really concurrent creates of the same overlapping
  entry produce exactly one row. SQLite ignores row locks, so that test is skipped there.
"""
import threading
from datetime import date, time
from unittest import mock, skipUnless

from django.contrib.auth import get_user_model
from django.db import connection, connections
from django.test import TestCase, TransactionTestCase
from rest_framework.test import APIClient

from apps.leave_management.models import LeaveBalance, LeaveRequest
from apps.overtime.models import Client, OvertimeLog

User = get_user_model()
LEAVE = {'start_date': '2026-12-07', 'end_date': '2026-12-11', 'request_type': 'vacation', 'reason': 't'}


def _client(user):
    api = APIClient()
    api.force_authenticate(user=user)
    return api


class LockOrderTests(TestCase):
    """The lock is the first thing that happens, so nothing is validated against stale rows."""

    def setUp(self):
        self.emp = User.objects.create_user(username='lo_emp', password='x')
        LeaveBalance.objects.create(
            user=self.emp, leave_type='vacation', year=2026, total_days=25, accrual_start_date=date(2000, 1, 1),
        )
        self.client_obj = Client.objects.create(name='LO', code='LO')

    def _order(self, call, path_to_check):
        events = []
        with mock.patch(path_to_check[0], side_effect=lambda *a, **k: events.append('lock')), \
                mock.patch(path_to_check[1], side_effect=lambda *a, **k: events.append('check') or None):
            call()
        return events

    def test_leave_locks_before_the_overlap_check(self):
        events = self._order(
            lambda: _client(self.emp).post('/api/leave-management/requests/', LEAVE, format='json'),
            ('apps.leave_management.viewsets.lock_person',
             'apps.leave_management.viewsets.LeaveRequestViewSet._ensure_no_overlap'),
        )
        self.assertEqual(events[:2], ['lock', 'check'])

    def test_overtime_locks_before_the_overlap_check(self):
        events = self._order(
            lambda: _client(self.emp).post('/api/overtime/logs/', {
                'client': self.client_obj.pk, 'date': '2026-12-07', 'start_time': '19:00', 'end_time': '21:00',
                'description': 'x',
            }, format='json'),
            ('apps.overtime.viewsets.lock_person', 'core.utils.time_overlap.find_overlapping_entry'),
        )
        self.assertEqual(events[:2], ['lock', 'check'])


class EditLockOrderTests(LockOrderTests):
    """Edits take the same person lock first (audit 2026-11-17 M9)."""

    def test_leave_edit_locks_before_the_overlap_check(self):
        api = _client(self.emp)
        leave_id = api.post('/api/leave-management/requests/', LEAVE, format='json').data['id']
        events = self._order(
            lambda: api.patch(f'/api/leave-management/requests/{leave_id}/',
                              {'end_date': '2026-12-10'}, format='json'),
            ('apps.leave_management.viewsets.lock_person',
             'apps.leave_management.viewsets.LeaveRequestViewSet._ensure_no_overlap'),
        )
        self.assertEqual(events[:2], ['lock', 'check'])

    def test_overtime_edit_locks_before_the_overlap_check(self):
        row = OvertimeLog.objects.create(
            user=self.emp, client=self.client_obj, date=date(2026, 12, 7), hours=2,
            start_time=time(19, 0), end_time=time(21, 0), status='pending',
        )
        events = self._order(
            lambda: _client(self.emp).patch(f'/api/overtime/logs/{row.pk}/?ignore_date_filter=true',
                                            {'end_time': '22:00'}, format='json'),
            ('apps.overtime.viewsets.lock_person', 'core.utils.time_overlap.find_overlapping_entry'),
        )
        self.assertEqual(events[:2], ['lock', 'check'])

    def test_standby_edit_locks_before_the_overlap_check(self):
        from apps.standby.models import StandbyLog

        row = StandbyLog.objects.create(
            user=self.emp, date=date(2026, 12, 7), hours=2,
            start_time=time(19, 0), end_time=time(21, 0), status='pending',
        )
        events = self._order(
            lambda: _client(self.emp).patch(f'/api/standby/logs/{row.pk}/?ignore_date_filter=true',
                                            {'end_time': '22:00'}, format='json'),
            ('apps.standby.viewsets.lock_person', 'core.utils.time_overlap.find_overlapping_entry'),
        )
        self.assertEqual(events[:2], ['lock', 'check'])


@skipUnless(connection.vendor == 'postgresql', 'row locks are only real on PostgreSQL')
class ConcurrentCreateTests(TransactionTestCase):
    def test_two_simultaneous_identical_leave_requests_create_one(self):
        emp = User.objects.create_user(username='cc_emp', password='x')
        LeaveBalance.objects.create(
            user=emp, leave_type='vacation', year=2026, total_days=25, accrual_start_date=date(2000, 1, 1),
        )
        barrier = threading.Barrier(2)
        statuses = []

        def worker():
            try:
                api = _client(emp)
                barrier.wait()
                statuses.append(api.post('/api/leave-management/requests/', LEAVE, format='json').status_code)
            finally:
                connections.close_all()

        threads = [threading.Thread(target=worker) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(sorted(statuses), [201, 400], statuses)
        self.assertEqual(LeaveRequest.objects.filter(user=emp).count(), 1)

    def test_two_simultaneous_overlapping_overtime_entries_create_one(self):
        emp = User.objects.create_user(username='cc_ot', password='x')
        client_obj = Client.objects.create(name='CC', code='CC')
        body = {
            'client': client_obj.pk, 'date': '2026-12-07', 'start_time': '19:00', 'end_time': '21:00',
            'description': 'x',
        }
        barrier = threading.Barrier(2)
        statuses = []

        def worker():
            try:
                api = _client(emp)
                barrier.wait()
                statuses.append(api.post('/api/overtime/logs/', body, format='json').status_code)
            finally:
                connections.close_all()

        threads = [threading.Thread(target=worker) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(sorted(statuses), [201, 400], statuses)
        self.assertEqual(OvertimeLog.objects.filter(user=emp).count(), 1)
