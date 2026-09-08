from datetime import date

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from apps.overtime.models import Client, OvertimeLog
from apps.users.models import Team, TeamMembership
from plugins.notifications.models import Notification
from plugins.notifications.plugin import NotificationPlugin


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
