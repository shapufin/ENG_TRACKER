"""M4 (audit 2026-11-16): a holiday added or removed later recounts future leave and its balance."""
from datetime import date
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.dashboard.models.calendar import PublicHoliday
from apps.leave_management.models import LeaveBalance, LeaveRequest
from apps.leave_management.services.holiday_recount import recount_leave_days

User = get_user_model()
WEEK = {'start_date': '2026-12-07', 'end_date': '2026-12-11', 'request_type': 'vacation', 'reason': 't'}
TUESDAY = date(2026, 12, 8)
EARLY = date(2026, 11, 20)  # "today" for the service: before the request


class HolidayRecountTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.emp = User.objects.create_user(username='hr_emp', password='x')
        self.tl = User.objects.create_user(username='hr_tl', password='x', is_staff=True)
        self.balance = LeaveBalance.objects.create(
            user=self.emp, leave_type='vacation', year=2026, total_days=25,
            accrual_start_date=date(2000, 1, 1),
        )

    def _request(self, approve=False):
        self.api.force_authenticate(user=self.emp)
        response = self.api.post('/api/leave-management/requests/', WEEK, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        leave_id = response.data['id']
        if approve:
            self.api.force_authenticate(user=self.tl)
            self.api.post(f'/api/leave-management/requests/{leave_id}/approve/', {}, format='json')
        return LeaveRequest.objects.get(pk=leave_id)

    def _holiday(self, **kw):
        with self.captureOnCommitCallbacks(execute=True):
            return PublicHoliday.objects.create(name='Late holiday', date=TUESDAY, **kw)

    def _balance(self):
        self.balance.refresh_from_db()
        return float(self.balance.pending_days), float(self.balance.used_days)

    def test_a_holiday_added_later_recounts_a_pending_request(self):
        leave = self._request()
        self.assertEqual(self._balance(), (5.0, 0.0))

        self._holiday()

        leave.refresh_from_db()
        self.assertEqual(float(leave.days_counted), 4.0)
        self.assertEqual(self._balance(), (4.0, 0.0))

    def test_a_holiday_added_later_recounts_an_approved_request(self):
        leave = self._request(approve=True)
        self.assertEqual(self._balance(), (0.0, 5.0))

        self._holiday()

        leave.refresh_from_db()
        self.assertEqual(float(leave.days_counted), 4.0)
        self.assertEqual(self._balance(), (0.0, 4.0))

    def test_removing_the_holiday_charges_the_day_again(self):
        holiday = self._holiday()
        leave = self._request(approve=True)
        self.assertEqual(float(leave.days_counted), 4.0)

        with self.captureOnCommitCallbacks(execute=True):
            holiday.delete()

        leave.refresh_from_db()
        self.assertEqual(float(leave.days_counted), 5.0)
        self.assertEqual(self._balance(), (0.0, 5.0))

    def test_a_workspace_only_holiday_changes_nothing(self):
        from apps.dashboard.models.calendar import CalendarWorkspace

        leave = self._request()
        workspace = CalendarWorkspace.objects.create(name='W', code='W')
        self._holiday(calendar=workspace)

        leave.refresh_from_db()
        self.assertEqual(float(leave.days_counted), 5.0)

    def test_a_request_that_already_ended_is_left_alone(self):
        leave = self._request()
        self._holiday()
        LeaveRequest.objects.filter(pk=leave.pk).update(days_counted=5)

        changes = recount_leave_days(today=date(2027, 1, 4), apply=True)

        self.assertEqual(changes, [])
        leave.refresh_from_db()
        self.assertEqual(float(leave.days_counted), 5.0)

    def test_a_rejected_request_is_left_alone(self):
        leave = self._request()
        self.api.force_authenticate(user=self.tl)
        self.api.post(f'/api/leave-management/requests/{leave.pk}/reject/', {'rejection_reason': 'x'}, format='json')
        self._holiday()

        leave.refresh_from_db()
        self.assertEqual(float(leave.days_counted), 5.0)
        self.assertEqual(self._balance(), (0.0, 0.0))

    def test_a_dry_run_reports_and_changes_nothing(self):
        leave = self._request()
        PublicHoliday.objects.bulk_create([PublicHoliday(name='Late holiday', date=TUESDAY)])  # no signal

        changes = recount_leave_days(today=EARLY, apply=False)

        self.assertEqual([(c.request_id, c.old_days, c.new_days) for c in changes], [(leave.pk, 5, 4)])
        leave.refresh_from_db()
        self.assertEqual(float(leave.days_counted), 5.0)
        self.assertEqual(self._balance(), (5.0, 0.0))

    def test_applying_twice_changes_nothing_the_second_time(self):
        self._request()
        PublicHoliday.objects.bulk_create([PublicHoliday(name='Late holiday', date=TUESDAY)])

        self.assertEqual(len(recount_leave_days(today=EARLY, apply=True)), 1)
        self.assertEqual(recount_leave_days(today=EARLY, apply=True), [])
        self.assertEqual(self._balance(), (4.0, 0.0))

    def test_the_command_is_a_dry_run_unless_apply_is_given(self):
        leave = self._request()
        PublicHoliday.objects.bulk_create([PublicHoliday(name='Late holiday', date=TUESDAY)])

        out = StringIO()
        call_command('recount_leave_days', '--from', '2026-12-01', '--to', '2026-12-31', stdout=out)
        leave.refresh_from_db()
        self.assertEqual(float(leave.days_counted), 5.0)
        self.assertIn('dry run', out.getvalue().lower())

        call_command('recount_leave_days', '--from', '2026-12-01', '--to', '2026-12-31', '--apply', stdout=StringIO())
        leave.refresh_from_db()
        self.assertEqual(float(leave.days_counted), 4.0)
