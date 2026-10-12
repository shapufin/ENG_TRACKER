from datetime import date, datetime
from zoneinfo import ZoneInfo

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from apps.overtime.models import Client, OvertimeLog
from apps.users.models import Team, TeamMembership
from apps.users.services.approval_periods import assert_work_date_open, is_work_date_open
from plugins.notifications.models import Notification
from plugins.notifications.plugin import NotificationPlugin

TIRANE = ZoneInfo('Europe/Tirane')


class WorkDateCutoffTests(TestCase):
    def test_september_open_until_oct_1_end(self):
        self.assertTrue(is_work_date_open(date(2026, 9, 15), now=datetime(2026, 10, 1, 23, 59, tzinfo=TIRANE)))

    def test_september_closed_at_oct_2_midnight(self):
        self.assertFalse(is_work_date_open(date(2026, 9, 15), now=datetime(2026, 10, 2, 0, 0, tzinfo=TIRANE)))

    def test_august_closed_from_sep_2_and_open_before(self):
        self.assertFalse(is_work_date_open(date(2026, 8, 20), now=datetime(2026, 9, 2, 0, 0, tzinfo=TIRANE)))
        self.assertTrue(is_work_date_open(date(2026, 8, 20), now=datetime(2026, 9, 1, 23, 59, tzinfo=TIRANE)))

    def test_closed_message_names_the_real_cutoff_day(self):
        from rest_framework.exceptions import ValidationError
        with self.assertRaisesMessage(ValidationError, 'until the 2nd of the following month'):
            assert_work_date_open(date(2026, 9, 15), now=datetime(2026, 10, 2, 0, 0, tzinfo=TIRANE))

    def test_current_month_always_open(self):
        self.assertTrue(is_work_date_open(date(2026, 10, 1), now=datetime(2026, 10, 20, 12, 0, tzinfo=TIRANE)))

    def test_cutoff_uses_tirane_not_utc(self):
        # 2026-10-01 23:30 UTC is 2026-10-02 01:30 Tirane (UTC+2 in October): closed.
        now = datetime(2026, 10, 1, 23, 30, tzinfo=ZoneInfo('UTC'))
        self.assertFalse(is_work_date_open(date(2026, 9, 15), now=now))

    def test_december_rolls_to_january(self):
        self.assertTrue(is_work_date_open(date(2026, 12, 5), now=datetime(2027, 1, 1, 23, 59, tzinfo=TIRANE)))
        self.assertFalse(is_work_date_open(date(2026, 12, 5), now=datetime(2027, 1, 2, 0, 0, tzinfo=TIRANE)))

    def test_assert_raises_with_month_message(self):
        from rest_framework.exceptions import ValidationError
        with self.assertRaises(ValidationError) as ctx:
            assert_work_date_open(date(2026, 9, 15), now=datetime(2026, 10, 2, 0, 0, tzinfo=TIRANE))
        self.assertIn('September 2026', str(ctx.exception.detail[0]))


class WorkDateCutoffApiTests(TestCase):
    def setUp(self):
        from unittest.mock import patch
        self.employee = User.objects.create_user(username='cutoff-employee', password='pass')
        self.staff = User.objects.create_user(username='cutoff-staff', password='pass', is_staff=True)
        self.client_obj = Client.objects.create(name='Cutoff Client', code='CUTOFF-CLIENT')
        self.api = APIClient()
        self.api.force_authenticate(user=self.employee)
        self._patch = patch('django.utils.timezone.now')
        self.now = self._patch.start()
        self.addCleanup(self._patch.stop)

    def _at(self, when):
        self.now.return_value = when

    def _post_ot(self, work_date):
        return self.api.post('/api/overtime/logs/', {
            'client': self.client_obj.id, 'date': work_date, 'hours': 2,
        }, format='json')

    def _post_sb(self, work_date):
        return self.api.post('/api/standby/logs/', {'date': work_date, 'hours': 8}, format='json')

    def test_ot_september_accepted_before_oct_2(self):
        self._at(datetime(2026, 10, 1, 23, 59, tzinfo=TIRANE))
        self.assertEqual(self._post_ot('2026-09-30').status_code, 201)

    def test_ot_september_rejected_from_oct_2(self):
        self._at(datetime(2026, 10, 2, 0, 0, tzinfo=TIRANE))
        response = self._post_ot('2026-09-30')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('September 2026', str(response.data))

    def test_ot_current_month_always_accepted(self):
        self._at(datetime(2026, 10, 20, 12, 0, tzinfo=TIRANE))
        self.assertEqual(self._post_ot('2026-10-15').status_code, 201)

    def test_ot_cutoff_applies_to_staff_without_bypass(self):
        self.api.force_authenticate(user=self.staff)
        self._at(datetime(2026, 10, 2, 0, 0, tzinfo=TIRANE))
        self.assertEqual(self._post_ot('2026-09-30').status_code, 400)

    def test_standby_august_rejected_from_sep_2(self):
        self._at(datetime(2026, 9, 2, 0, 0, tzinfo=TIRANE))
        response = self._post_sb('2026-08-20')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('August 2026', str(response.data))

    def test_standby_september_accepted_before_oct_2(self):
        self._at(datetime(2026, 10, 1, 23, 59, tzinfo=TIRANE))
        self.assertEqual(self._post_sb('2026-09-30').status_code, 201)


class WorkDateCutoffUpdateTests(TestCase):
    def setUp(self):
        from unittest.mock import patch
        from apps.standby.models import StandbyLog
        self.employee = User.objects.create_user(username='upd-employee', password='pass')
        self.client_obj = Client.objects.create(name='Upd Client', code='UPD-CLIENT')
        self.api = APIClient()
        self.api.force_authenticate(user=self.employee)
        self._patch = patch('django.utils.timezone.now', return_value=datetime(2026, 10, 12, 12, 0, tzinfo=TIRANE))
        self._patch.start()
        self.addCleanup(self._patch.stop)
        self.ot = OvertimeLog.objects.create(user=self.employee, client=self.client_obj, date=date(2026, 10, 5), hours=2)
        self.sb = StandbyLog.objects.create(user=self.employee, date=date(2026, 10, 5), hours=8)

    def test_overtime_cannot_be_moved_into_closed_month(self):
        response = self.api.patch(f'/api/overtime/logs/{self.ot.id}/', {'date': '2026-09-15'}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.ot.refresh_from_db()
        self.assertEqual(self.ot.date, date(2026, 10, 5))

    def test_standby_cannot_be_moved_into_closed_month(self):
        response = self.api.patch(f'/api/standby/logs/{self.sb.id}/', {'date': '2026-09-15', 'hours': 8}, format='json')
        self.assertEqual(response.status_code, 400, response.data)

    def test_standby_partial_update_without_hours_is_accepted(self):
        response = self.api.patch(f'/api/standby/logs/{self.sb.id}/', {'description': 'note'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)


class TeamLeaderEditGuardTests(TestCase):
    def setUp(self):
        self.tl = User.objects.create_user(username='guard-tl', password='pass')
        self.tl.profile.is_albanian_tl_role = True
        self.tl.profile.save(update_fields=['is_albanian_tl_role', 'updated_at'])
        self.employee = User.objects.create_user(username='guard-employee', password='pass')
        self.team = Team.objects.create(name='Guard Team', code='GUARD', team_leader=self.tl)
        TeamMembership.objects.create(user_profile=self.employee.profile, team=self.team, is_primary_team=True)
        self.client_obj = Client.objects.create(name='Guard Client', code='GUARD-CLIENT')
        self.entry = OvertimeLog.objects.create(
            user=self.employee, client=self.client_obj, date=date.today().replace(day=1), hours=2,
        )
        self.api = APIClient()
        self.api.force_authenticate(user=self.tl)

    def test_tl_cannot_edit_team_member_overtime(self):
        response = self.api.patch(
            f'/api/overtime/logs/{self.entry.id}/', {'description': 'tl edit'}, format='json',
        )
        self.assertIn(response.status_code, (403, 404), response.data)
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.description, '')

    def test_tl_cannot_edit_team_member_overtime_with_workspace_param(self):
        response = self.api.patch(
            f'/api/overtime/logs/{self.entry.id}/?workspace_ids=1',
            {'start_time': '09:00:00', 'end_time': '12:00:00'}, format='json',
        )
        self.assertIn(response.status_code, (403, 404), response.data)
        self.entry.refresh_from_db()
        self.assertIsNone(self.entry.start_time)

    def test_tl_can_still_approve_team_member_overtime(self):
        response = self.api.post(f'/api/overtime/logs/{self.entry.id}/approve/', format='json')
        self.assertEqual(response.status_code, 200, response.data)

    def test_employee_can_still_edit_own_overtime(self):
        self.api.force_authenticate(user=self.employee)
        response = self.api.patch(
            f'/api/overtime/logs/{self.entry.id}/', {'description': 'own edit'}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)

    def test_staff_edit_of_team_member_overtime_is_not_widened(self):
        staff = User.objects.create_user(username='guard-staff', password='pass', is_staff=True)
        self.api.force_authenticate(user=staff)
        response = self.api.patch(
            f'/api/overtime/logs/{self.entry.id}/', {'description': 'staff edit'}, format='json',
        )
        self.assertEqual(response.status_code, 404, response.data)
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.description, '')


class ApprovalPeriodWorkflowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        NotificationPlugin().ready()
        self.tl = User.objects.create_user(username='period-tl', password='pass')
        self.tl.profile.is_albanian_tl_role = True
        self.tl.profile.save(update_fields=['is_albanian_tl_role', 'updated_at'])
        self.employee = User.objects.create_user(username='period-employee', password='pass')
        self.team = Team.objects.create(
            name='Period Team', code='PERIOD', team_leader=self.tl,
        )
        TeamMembership.objects.create(
            user_profile=self.employee.profile,
            team=self.team,
            is_primary_team=True,
        )
        self.client_obj = Client.objects.create(name='Period Client', code='PERIOD-CLIENT')
        self.client.force_authenticate(user=self.tl)

    def _finalize(self, period):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(
                '/api/users/approval-periods/finalize/',
                {'period': period},
                format='json',
            )

    def test_finalize_assigns_new_entries_to_next_period_and_notifies_employee(self):
        response = self._finalize('2026-05-01')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['requested_processing_period'], '2026-06-01')
        self.assertEqual(response.data['affected_member_count'], 1)

        entry = OvertimeLog.objects.create(
            user=self.employee,
            client=self.client_obj,
            date=date(2026, 5, 30),
            hours=2,
        )
        self.assertEqual(entry.requested_processing_period, date(2026, 6, 1))
        self.assertEqual(entry.approval_period_close_id, response.data['id'])

        notification = Notification.objects.get(
            user=self.employee,
            dedupe_key=f"period-close:{response.data['id']}:user:{self.employee.id}",
        )
        self.assertIn('June 2026', notification.message)

    def test_finalize_is_idempotent_for_same_tl_and_period(self):
        with self.captureOnCommitCallbacks(execute=True):
            first = self.client.post(
                '/api/users/approval-periods/finalize/',
                {'period': '2026-05-01'},
                format='json',
            )
            second = self.client.post(
                '/api/users/approval-periods/finalize/',
                {'period': '2026-05-01'},
                format='json',
            )
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertTrue(second.data['already_finalized'])
        self.assertEqual(first.data['id'], second.data['id'])
        self.assertEqual(
            Notification.objects.filter(user=self.employee).count(),
            1,
        )

    def test_cr_only_user_does_not_receive_period_close_notification(self):
        from plugins.control_room.models import ControlRoomAccess

        cr_user = User.objects.create_user(username='cr-only', password='pass')
        TeamMembership.objects.create(
            user_profile=cr_user.profile,
            team=self.team,
            is_primary_team=True,
        )
        ControlRoomAccess.objects.create(user=cr_user, is_active=True)

        response = self._finalize('2026-05-01')
        self.assertEqual(response.status_code, 201, response.data)

        # The regular employee still gets notified.
        self.assertTrue(
            Notification.objects.filter(user=self.employee).exists()
        )
        # The CR-only user must NOT receive a period-finalization notification.
        self.assertFalse(
            Notification.objects.filter(user=cr_user).exists()
        )

    def test_employee_cannot_edit_entry_after_period_close(self):
        current_period = date.today().replace(day=1)
        entry = OvertimeLog.objects.create(
            user=self.employee,
            client=self.client_obj,
            date=date.today().replace(day=5),
            hours=2,
        )
        self.client.post(
            '/api/users/approval-periods/finalize/',
            {'period': current_period.isoformat()},
            format='json',
        )
        self.client.force_authenticate(user=self.employee)
        response = self.client.patch(
            f'/api/overtime/logs/{entry.id}/',
            {'description': 'attempted edit'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_in_window_late_entry_carries_over(self):
        from unittest.mock import patch
        with patch('django.utils.timezone.now', return_value=datetime(2026, 9, 29, 12, 0, tzinfo=TIRANE)):
            self._finalize('2026-09-01')
        with patch('django.utils.timezone.now', return_value=datetime(2026, 10, 1, 10, 0, tzinfo=TIRANE)):
            entry = OvertimeLog.objects.create(
                user=self.employee, client=self.client_obj, date=date(2026, 9, 30), hours=2,
            )
        self.assertEqual(entry.requested_processing_period, date(2026, 10, 1))

    def test_post_window_late_entry_rejected(self):
        from unittest.mock import patch
        with patch('django.utils.timezone.now', return_value=datetime(2026, 9, 29, 12, 0, tzinfo=TIRANE)):
            self._finalize('2026-09-01')
        self.client.force_authenticate(user=self.employee)
        with patch('django.utils.timezone.now', return_value=datetime(2026, 10, 2, 0, 0, tzinfo=TIRANE)):
            response = self.client.post('/api/overtime/logs/', {
                'client': self.client_obj.id, 'date': '2026-09-30', 'hours': 2,
            }, format='json')
        self.assertEqual(response.status_code, 400, response.data)
