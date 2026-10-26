"""A closed year is frozen for overtime and standby — for everyone (plan Y2).

The lock is one service (`apps.users.services.approval_periods`) and reaches the
API serializers, the object-permission mixin, the bulk actions, the two log
importers and the Django admin. Leave is deliberately outside it.
"""
from datetime import date, timedelta

from django.contrib.admin.sites import AdminSite
from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from apps.leave_management.models import GlobalSettings, LeaveBalance, LeaveRequest
from apps.overtime.models import Client, OvertimeLog
from apps.reports.models import AuditLog
from apps.standby.admin import StandbyLogAdmin
from apps.standby.models import StandbyLog
from apps.users.models import ClosedYear
from apps.users.services.approval_periods import (
    assert_year_open,
    clear_closed_year_cache,
    close_year,
    closed_year_error,
    is_year_closed,
    reopen_year,
)
from core.utils.timezone_local import business_today


class ClosedYearServiceTests(TestCase):
    def setUp(self):
        clear_closed_year_cache()
        self.addCleanup(clear_closed_year_cache)
        self.year = business_today().year

    def test_a_year_is_open_until_it_is_closed(self):
        self.assertFalse(is_year_closed(self.year))
        self.assertIsNone(closed_year_error(business_today()))

    def test_close_year_freezes_it_and_is_idempotent(self):
        close_year(self.year)
        close_year(self.year)
        self.assertTrue(is_year_closed(self.year))
        self.assertEqual(ClosedYear.objects.filter(year=self.year).count(), 1)

    def test_error_names_the_year_and_the_way_out(self):
        close_year(self.year)
        message = closed_year_error(business_today())
        self.assertIn(str(self.year), message)
        self.assertIn('reopen_year', message)

    def test_assert_year_open_raises_for_a_closed_year_only(self):
        close_year(self.year)
        with self.assertRaises(Exception) as ctx:
            assert_year_open(business_today())
        self.assertIn(str(self.year), str(ctx.exception))
        assert_year_open(date(self.year - 1, 6, 1))  # a different year is untouched

    def test_an_iso_string_work_date_is_understood(self):
        # importers hand over a parsed date, but a direct commit_row caller can
        # pass the raw cell text; the guard must not silently no-op there.
        close_year(self.year)
        self.assertIn(str(self.year), closed_year_error(f'{self.year}-06-01'))

    def test_closing_records_an_audit_entry(self):
        actor = User.objects.create_user(username='closer', password='x', is_superuser=True)
        close_year(self.year, actor=actor, snapshot_ref=f'{self.year}/v1')
        entry = AuditLog.objects.get(model_name='closedyear')
        self.assertEqual(entry.object_id, str(self.year))
        self.assertEqual(entry.extra_data['operation'], 'close_year')
        self.assertEqual(entry.extra_data['snapshot_ref'], f'{self.year}/v1')

    def test_reopen_needs_a_reason(self):
        close_year(self.year)
        with self.assertRaises(Exception):
            reopen_year(self.year, reason='  ')
        self.assertTrue(is_year_closed(self.year))

    def test_reopen_removes_the_lock_and_audits(self):
        close_year(self.year)
        self.assertTrue(reopen_year(self.year, reason='late correction'))
        self.assertFalse(is_year_closed(self.year))
        self.assertEqual(
            AuditLog.objects.get(model_name='closedyear', extra_data__operation='reopen_year')
            .extra_data['reason'],
            'late correction',
        )


class ClosedYearWriteLockTests(APITestCase):
    """Every write path refuses a closed year; reading it stays allowed."""

    def setUp(self):
        clear_closed_year_cache()
        self.addCleanup(clear_closed_year_cache)
        self.today = business_today()
        self.year = self.today.year
        self.client_row = Client.objects.create(name='Live', code='LIVE')

        self.user = User.objects.create_user(username='cy_user', password='x')
        self.tl = User.objects.create_user(username='cy_tl', password='x')
        self.staff = User.objects.create_user(username='cy_staff', password='x', is_staff=True)
        self.superuser = User.objects.create_user(
            username='cy_super', password='x', is_staff=True, is_superuser=True
        )
        profile = self.user.profile
        profile.italian_tl = self.tl
        profile.save(update_fields=['italian_tl'])

        # Created while the year is still open, so the lock can be tested on an
        # existing record rather than only on creation.
        self.log = OvertimeLog.objects.create(
            user=self.user, client=self.client_row, date=self.today, hours=2, status='pending',
        )
        # Staff and TL reach only their own rows for edit/delete (the viewset
        # scopes non-approval actions), so the lock is tested on a record each
        # of them can actually load.
        self.staff_log = OvertimeLog.objects.create(
            user=self.staff, client=self.client_row, date=self.today, hours=2, status='pending',
        )
        self.tl_log = OvertimeLog.objects.create(
            user=self.tl, client=self.client_row, date=self.today, hours=2, status='pending',
        )
        self.standby = StandbyLog.objects.create(
            user=self.user, date=self.today, hours=2, status='pending',
        )
        close_year(self.year)

    def _ot_payload(self):
        return {'client': self.client_row.pk, 'date': self.today.isoformat(), 'hours': 2}

    # --- create ------------------------------------------------------
    def test_create_is_refused_for_every_role(self):
        for actor in (self.user, self.tl, self.staff, self.superuser):
            with self.subTest(role=actor.username):
                self.client.force_authenticate(actor)
                response = self.client.post('/api/overtime/logs/', self._ot_payload(), format='json')
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
                self.assertIn(str(self.year), str(response.data))
        self.assertEqual(OvertimeLog.objects.count(), 3)

    def test_standby_create_is_refused(self):
        self.client.force_authenticate(self.superuser)
        response = self.client.post(
            '/api/standby/logs/',
            {'date': self.today.isoformat(), 'hours': 2},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn(str(self.year), str(response.data))

    # --- update / delete ---------------------------------------------
    def test_update_is_refused_for_every_role(self):
        cases = (
            (self.user, self.log),
            (self.tl, self.tl_log),
            (self.staff, self.staff_log),
            (self.superuser, self.log),
        )
        for actor, log in cases:
            with self.subTest(role=actor.username):
                self.client.force_authenticate(actor)
                response = self.client.patch(
                    f'/api/overtime/logs/{log.pk}/', {'hours': 3}, format='json'
                )
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.data)
                self.assertIn('reopen_year', str(response.data))
                log.refresh_from_db()
                self.assertEqual(log.hours, 2)

    def test_delete_is_refused_for_every_role(self):
        cases = (
            (self.user, self.log),
            (self.tl, self.tl_log),
            (self.staff, self.staff_log),
            (self.superuser, self.log),
        )
        for actor, log in cases:
            with self.subTest(role=actor.username):
                self.client.force_authenticate(actor)
                response = self.client.delete(f'/api/overtime/logs/{log.pk}/')
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.data)
                self.assertTrue(OvertimeLog.objects.filter(pk=log.pk).exists())

    # --- approve / reject / bulk -------------------------------------
    def test_approve_and_reject_are_refused(self):
        for action in ('approve', 'reject'):
            with self.subTest(action=action):
                self.client.force_authenticate(self.staff)
                response = self.client.post(
                    f'/api/overtime/logs/{self.log.pk}/{action}/',
                    {'rejection_reason': 'no'},
                    format='json',
                )
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.data)
        self.log.refresh_from_db()
        self.assertEqual(self.log.status, 'pending')

    def test_bulk_approve_and_delete_skip_frozen_rows(self):
        self.client.force_authenticate(self.superuser)
        approve = self.client.post(
            '/api/overtime/logs/bulk_approve/', {'ids': [self.log.pk]}, format='json'
        )
        self.assertEqual(approve.status_code, status.HTTP_200_OK)
        self.assertEqual(approve.data['approved_count'], 0)
        self.assertEqual(approve.data['failed_ids'], [self.log.pk])

        delete = self.client.post(
            '/api/overtime/logs/bulk_delete/', {'ids': [self.log.pk]}, format='json'
        )
        self.assertEqual(delete.status_code, status.HTTP_200_OK)
        self.assertEqual(delete.data['deleted_count'], 0)
        self.assertEqual(delete.data['failed_ids'], [self.log.pk])
        self.assertTrue(OvertimeLog.objects.filter(pk=self.log.pk).exists())

    # --- reads stay open ---------------------------------------------
    def test_a_closed_year_is_still_readable(self):
        self.client.force_authenticate(self.superuser)
        detail = self.client.get(f'/api/overtime/logs/{self.log.pk}/')
        self.assertEqual(detail.status_code, status.HTTP_200_OK, detail.data)
        listing = self.client.get('/api/overtime/logs/')
        self.assertEqual(listing.status_code, status.HTTP_200_OK, listing.data)

    # --- importer -----------------------------------------------------
    def test_overtime_importer_reports_the_closed_year_per_row(self):
        from plugins.data_import.importers.overtime_logs import OvertimeLogImporter

        result = OvertimeLogImporter().commit_row(
            {
                'username': self.user.username,
                'client_code': 'LIVE',
                'date': self.today,
                'hours': '2',
                '__row_index': 1,
            },
            {},
            context={'actor': self.staff},
        )
        self.assertEqual(result.status, 'error')
        self.assertIn(str(self.year), result.errors[0])
        self.assertEqual(OvertimeLog.objects.count(), 3)

    def test_standby_importer_reports_the_closed_year_per_row(self):
        from plugins.data_import.importers.standby_logs import StandbyLogImporter

        result = StandbyLogImporter().commit_row(
            {
                'username': self.user.username,
                'date': self.today,
                'hours': '2',
                '__row_index': 1,
            },
            {},
            context={'actor': self.staff},
        )
        self.assertEqual(result.status, 'error')
        self.assertIn(str(self.year), result.errors[0])

    # --- admin --------------------------------------------------------
    def test_standby_admin_refuses_a_closed_year(self):
        admin_view = StandbyLogAdmin(StandbyLog, AdminSite())
        obj = StandbyLog(user=self.user, date=self.today, hours=1)
        with self.assertRaises(Exception) as ctx:
            admin_view.save_model(request=None, obj=obj, form=None, change=False)
        self.assertIn(str(self.year), str(ctx.exception))

    # --- reopen -------------------------------------------------------
    def test_reopen_command_unfreezes_the_year(self):
        call_command('reopen_year', year=self.year, reason='payroll correction')
        self.assertFalse(is_year_closed(self.year))
        self.client.force_authenticate(self.user)
        response = self.client.post('/api/overtime/logs/', self._ot_payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_reopen_command_refuses_an_open_year(self):
        call_command('reopen_year', year=self.year, reason='x')
        with self.assertRaises(Exception):
            call_command('reopen_year', year=self.year, reason='x')


class ClosedYearLeavesLeaveAloneTests(APITestCase):
    """Leave is deliberately outside the lock (v1): cancellations flow into closed balances."""

    def setUp(self):
        clear_closed_year_cache()
        self.addCleanup(clear_closed_year_cache)
        self.today = business_today()
        self.year = self.today.year
        self.user = User.objects.create_user(username='cy_leave', password='x')
        settings_row, _ = GlobalSettings.objects.get_or_create(pk=1)
        LeaveBalance.objects.create(
            user=self.user,
            leave_type='vacation',
            year=self.year,
            total_days=settings_row.default_yearly_leave_days,
            accrual_start_date=date(2000, 1, 1),
        )
        close_year(self.year)

    def _next_weekday(self):
        day = self.today
        while day.weekday() >= 5:
            day += timedelta(days=1)
        return day

    def test_leave_can_still_be_requested_in_a_closed_year(self):
        start = self._next_weekday()
        if start.year != self.year:
            self.skipTest('the next weekday already falls in the following year')
        self.client.force_authenticate(self.user)
        response = self.client.post(
            '/api/leave-management/requests/',
            {
                'start_date': start.isoformat(),
                'end_date': start.isoformat(),
                'request_type': 'vacation',
                'reason': 'closed-year leave still works',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(LeaveRequest.objects.count(), 1)
