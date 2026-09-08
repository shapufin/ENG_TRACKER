"""
Tests for standby app.
"""

from datetime import time, date
from uuid import uuid4
from unittest.mock import MagicMock, patch

from django.http import StreamingHttpResponse
from django.test import TestCase
from django.core.exceptions import ValidationError
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from .models import StandbyLog, StandbyPattern
from apps.overtime.models import Client
from apps.dashboard.models.calendar import CalendarWorkspace
from apps.users.models import Team, TeamMembership


def _streaming_body(response) -> str:
    """Materialize a StreamingHttpResponse body as text."""
    if isinstance(response, StreamingHttpResponse):
        return b"".join(response.streaming_content).decode("utf-8")
    return response.content.decode("utf-8")


class StandbyLogViewSetTests(TestCase):
    """Test StandbyLogViewSet CRUD operations and approval workflow."""

    def setUp(self):
        """Set up test data."""
        self.client = APIClient()
        self.user = User.objects.create_user(username='testuser', password='testpass')
        self.staff_user = User.objects.create_user(username='staff', password='testpass', is_staff=True)
        today = date.today()
        self.pattern = StandbyPattern.objects.create(
            name='Test Pattern',
            user=self.user,
            recurrence_type='weekly',
            start_time=time(9, 0),
            end_time=time(17, 0),
            valid_from=today,
        )
        self.client.force_authenticate(user=self.user)

    def _create_workspace(self):
        return CalendarWorkspace.objects.create(name='Standby WS', code='sb-ws', is_public=True)

    def test_create_standby_log(self):
        """Test creating a standby log."""
        data = {
            'date': '2026-05-09',
            'hours': 8.0,
            'description': 'Test standby',
            'pattern': self.pattern.id
        }
        response = self.client.post('/api/standby/logs/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(StandbyLog.objects.count(), 1)

    def test_create_standby_log_staff_override(self):
        """Test staff user can override user field."""
        self.client.force_authenticate(user=self.staff_user)
        data = {
            'date': '2026-05-09',
            'hours': 8.0,
            'description': 'Test standby',
            'pattern': self.pattern.id,
            'user': self.user.id
        }
        response = self.client.post('/api/standby/logs/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        log = StandbyLog.objects.first()
        self.assertEqual(log.user, self.user)

    def test_approve_standby_log(self):
        """Test approving a standby log."""
        log = StandbyLog.objects.create(
            user=self.user,
            date='2026-05-09',
            hours=8.0,
            description='Test standby',
            pattern=self.pattern,
            status='pending'
        )
        self.client.force_authenticate(user=self.staff_user)
        response = self.client.post(f'/api/standby/logs/{log.id}/approve/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        log.refresh_from_db()
        self.assertEqual(log.status, 'approved')

    def test_team_logs_allows_staff_without_workspace(self):
        """team_logs allows staff to access without workspace_ids."""
        self.client.force_authenticate(user=self.staff_user)
        response = self.client.get('/api/standby/logs/team_logs/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_admin_logs_allows_staff_admin(self):
        """Staff admins (non-superuser) can read admin_logs.

        The /admin/standby-logs page is reachable by staff admins
        (SuperuserRoute admits isSuperuser||isAdmin||isHR), so the
        read-only admin_logs endpoint must admit them too — the previous
        superuser-only body check 403'd the page's only data call.
        """
        self.client.force_authenticate(user=self.staff_user)
        response = self.client.get('/api/standby/logs/admin_logs/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_admin_logs_allows_hr_read_only(self):
        """HR has view-all access per the HRReadOnlyMixin architecture and is
        admitted to the admin pages by the route guard — the GET-only
        admin_logs endpoint must accept HR as well."""
        hr_user = User.objects.create_user(username='sb-hr', password='testpass')
        profile = hr_user.profile
        profile.is_hr_user = True
        profile.save()
        self.client.force_authenticate(user=hr_user)
        response = self.client.get('/api/standby/logs/admin_logs/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_admin_logs_forbidden_for_regular_user(self):
        """Regular (non-staff, non-HR) users are still blocked from admin_logs."""
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/standby/logs/admin_logs/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_regular_team_member_is_forbidden_on_team_logs(self):
        """Regular team members must be blocked from standby team endpoints."""
        teammate = User.objects.create_user(username='sb-teammate', password='testpass')
        team = Team.objects.create(name='SB Team', code=f'SB{uuid4().hex[:8]}')
        TeamMembership.objects.create(user_profile=self.user.profile, team=team, is_primary_team=True)
        TeamMembership.objects.create(user_profile=teammate.profile, team=team)
        workspace = CalendarWorkspace.objects.create(
            name='SB Workspace',
            code=f'sb-ws-{uuid4().hex[:8]}',
            team=team,
            is_public=False,
        )
        teammate_pattern = StandbyPattern.objects.create(
            name='Team Pattern',
            user=teammate,
            recurrence_type='weekly',
            start_time=time(9, 0),
            end_time=time(17, 0),
            valid_from=date.today(),
        )
        StandbyLog.objects.create(
            user=teammate,
            date='2026-05-18',
            hours=6,
            description='Teammate standby',
            pattern=teammate_pattern,
        )

        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/standby/logs/team_logs/', {'workspace_ids': str(workspace.id)})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.data)

    def test_user_without_team_rejected_from_standby_team_logs(self):
        """Users lacking team membership should be rejected from team_logs."""
        team = Team.objects.create(name='Other SB Team', code=f'SB{uuid4().hex[8:16]}')
        workspace = CalendarWorkspace.objects.create(
            name='Other SB Workspace',
            code=f'sb-ws-{uuid4().hex[8:]}',
            team=team,
            is_public=False,
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/standby/logs/team_logs/', {'workspace_ids': str(workspace.id)})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.data)

    def test_team_pending_allows_staff_without_workspace(self):
        """team_pending allows staff to access without workspace_ids."""
        self.client.force_authenticate(user=self.staff_user)
        response = self.client.get('/api/standby/logs/team_pending/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_team_pending_months_groups_by_month(self):
        """team_pending_months returns months with pending counts, sorted ascending."""
        StandbyLog.objects.create(
            user=self.user, date=date(2026, 3, 15), hours=2,
            description='Mar', pattern=self.pattern, status='pending',
        )
        StandbyLog.objects.create(
            user=self.user, date=date(2026, 1, 10), hours=4,
            description='Jan', pattern=self.pattern, status='pending',
        )
        StandbyLog.objects.create(
            user=self.user, date=date(2026, 2, 5), hours=1,
            description='Approved', pattern=self.pattern, status='approved',
        )
        self.client.force_authenticate(user=self.staff_user)
        response = self.client.get('/api/standby/logs/team_pending_months/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        months = response.data
        self.assertEqual(len(months), 2)
        self.assertEqual(months[0]['month'], '2026-01-01')
        self.assertEqual(months[0]['count'], 1)
        self.assertEqual(months[1]['month'], '2026-03-01')
        self.assertEqual(months[1]['count'], 1)

    def test_regular_user_only_sees_personal_standby_logs(self):
        """Regular users must only receive their own standby logs."""
        other_user = User.objects.create_user(username='sb-other', password='testpass')
        other_pattern = StandbyPattern.objects.create(
            name='Other Pattern',
            user=other_user,
            recurrence_type='weekly',
            start_time=time(10, 0),
            end_time=time(18, 0),
            valid_from=date.today(),
        )
        StandbyLog.objects.create(
            user=self.user,
            date=date.today(),
            hours=6,
            description='My standby',
            pattern=self.pattern,
        )
        StandbyLog.objects.create(
            user=other_user,
            date=date.today(),
            hours=7,
            description='Should be hidden',
            pattern=other_pattern,
        )

        response = self.client.get('/api/standby/logs/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['user'], self.user.id)

    def test_staff_user_only_sees_their_standby_logs(self):
        """Staff should not get global standby data from the personal endpoint."""
        other_user = User.objects.create_user(username='sb-other-staff', password='testpass')
        other_pattern = StandbyPattern.objects.create(
            name='Other Pattern Staff',
            user=other_user,
            recurrence_type='weekly',
            start_time=time(12, 0),
            end_time=time(20, 0),
            valid_from=date.today(),
        )
        StandbyLog.objects.create(
            user=self.staff_user,
            date=date.today(),
            hours=4,
            description='Staff standby',
            pattern=self.pattern,
        )
        StandbyLog.objects.create(
            user=other_user,
            date=date.today(),
            hours=8,
            description='Hidden standby',
            pattern=other_pattern,
        )

        self.client.force_authenticate(user=self.staff_user)
        response = self.client.get('/api/standby/logs/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['user'], self.staff_user.id)

    def test_personal_standby_logs_ignore_workspace_scope_mismatch(self):
        """workspace_ids filter must not remove the requester's own standby logs."""
        foreign_workspace = CalendarWorkspace.objects.create(
            name='Foreign SB Workspace',
            code=f'sb-ws-{uuid4().hex[:6]}',
            is_public=False,
        )
        other_user = User.objects.create_user(username='sb-other-ws', password='testpass')
        other_pattern = StandbyPattern.objects.create(
            name='Foreign Pattern',
            user=other_user,
            recurrence_type='weekly',
            start_time=time(11, 0),
            end_time=time(19, 0),
            valid_from=date.today(),
        )
        today = date.today()
        StandbyLog.objects.create(
            user=self.user,
            date=today,
            hours=5,
            description='Visible even with workspace filter',
            pattern=self.pattern,
        )
        StandbyLog.objects.create(
            user=other_user,
            date=today,
            hours=6,
            description='Other user',
            pattern=other_pattern,
        )

        response = self.client.get(
            '/api/standby/logs/',
            {'workspace_ids': str(foreign_workspace.id)}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['user'], self.user.id)


class StandbyMonthlyLockTests(TestCase):
    """Test the MonthlyLockMixin on StandbyLogViewSet.

    Owners cannot edit/delete records whose ``date`` is in a strictly past
    month. Admins/superusers bypass. Approve/reject are exempt.
    """

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='sb-owner', password='testpass')
        self.staff = User.objects.create_user(username='sb-admin', password='testpass', is_staff=True)
        today = date.today()
        self.pattern = StandbyPattern.objects.create(
            name='Lock Pattern',
            user=self.user,
            recurrence_type='weekly',
            start_time=time(9, 0),
            end_time=time(17, 0),
            valid_from=today,
        )
        past_month_date = (
            date(today.year, today.month - 1, 15) if today.month > 1
            else date(today.year - 1, 12, 15)
        )
        self.past_log = StandbyLog.objects.create(
            user=self.user,
            date=past_month_date,
            hours=2,
            description='Past month approved',
            pattern=self.pattern,
            status='approved',
        )
        self.past_pending_log = StandbyLog.objects.create(
            user=self.user,
            date=past_month_date,
            hours=2,
            description='Past month pending',
            pattern=self.pattern,
            status='pending',
        )
        self.current_log = StandbyLog.objects.create(
            user=self.user,
            date=today,
            hours=3,
            description='Current month',
            pattern=self.pattern,
            status='pending',
        )
        self.staff_past_log = StandbyLog.objects.create(
            user=self.staff,
            date=past_month_date,
            hours=4,
            description='Staff past month',
            pattern=self.pattern,
            status='pending',
        )
        # Past-month approved record owned by the admin (for is_staff delete-lock test)
        self.staff_past_approved_log = StandbyLog.objects.create(
            user=self.staff,
            date=past_month_date,
            hours=3,
            description='Staff past month approved',
            pattern=self.pattern,
            status='approved',
        )

    def test_owner_cannot_delete_past_month_approved_record(self):
        """Approved records from a past month are locked for non-staff."""
        self.client.force_authenticate(user=self.user)
        response = self.client.delete(
            f'/api/standby/logs/{self.past_log.id}/?ignore_date_filter=true'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(StandbyLog.objects.filter(id=self.past_log.id).exists())

    def test_owner_can_delete_past_month_pending_record(self):
        """Pending records can be deleted even from a past month — the user
        retains leverage to remove un-approved entries (e.g. carried-over)."""
        self.client.force_authenticate(user=self.user)
        response = self.client.delete(
            f'/api/standby/logs/{self.past_pending_log.id}/?ignore_date_filter=true'
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(StandbyLog.objects.filter(id=self.past_pending_log.id).exists())

    def test_owner_cannot_update_past_month_record(self):
        """Updates are still locked for past months, even for pending records."""
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            f'/api/standby/logs/{self.past_pending_log.id}/?ignore_date_filter=true',
            {'hours': 5},
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.past_pending_log.refresh_from_db()
        self.assertEqual(self.past_pending_log.hours, 2)

    def test_owner_can_delete_current_month_record(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.delete(
            f'/api/standby/logs/{self.current_log.id}/?ignore_date_filter=true'
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(StandbyLog.objects.filter(id=self.current_log.id).exists())

    def test_admin_can_delete_past_month_record(self):
        self.client.force_authenticate(user=self.staff)
        response = self.client.delete(
            f'/api/standby/logs/{self.staff_past_log.id}/?ignore_date_filter=true'
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(StandbyLog.objects.filter(id=self.staff_past_log.id).exists())

    def test_bulk_delete_includes_past_month_pending_for_owner(self):
        """Bulk delete now includes pending past-month records for the owner."""
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            '/api/standby/logs/bulk_delete/',
            {'ids': [self.past_log.id, self.past_pending_log.id, self.current_log.id]},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # pending past + current = 2 deleted; approved past = 1 failed
        self.assertEqual(response.data['deleted_count'], 2)
        self.assertIn(self.past_log.id, response.data['failed_ids'])
        self.assertFalse(StandbyLog.objects.filter(id=self.past_pending_log.id).exists())
        self.assertFalse(StandbyLog.objects.filter(id=self.current_log.id).exists())
        self.assertTrue(StandbyLog.objects.filter(id=self.past_log.id).exists())

    def test_approve_past_month_record_is_exempt(self):
        self.client.force_authenticate(user=self.staff)
        response = self.client.post(f'/api/standby/logs/{self.past_log.id}/approve/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.past_log.refresh_from_db()
        self.assertEqual(self.past_log.status, 'approved')

    def test_staff_cannot_delete_past_month_approved_record(self):
        """is_staff (non-superuser) cannot delete an approved past-month record.

        Only is_superuser can override the lock for non-pending deletes in
        past/closed months. is_staff retains update access but not delete.
        """
        self.client.force_authenticate(user=self.staff)
        response = self.client.delete(
            f'/api/standby/logs/{self.staff_past_approved_log.id}/?ignore_date_filter=true'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(StandbyLog.objects.filter(id=self.staff_past_approved_log.id).exists())

    def test_superuser_can_delete_past_month_approved_record(self):
        """is_superuser can delete an approved past-month record (override)."""
        superuser = User.objects.create_user(
            username='sb-super', password='testpass', is_staff=True, is_superuser=True,
        )
        self.client.force_authenticate(user=superuser)
        response = self.client.delete(
            f'/api/standby/logs/{self.past_log.id}/?ignore_date_filter=true'
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(StandbyLog.objects.filter(id=self.past_log.id).exists())

    def test_superuser_delete_in_locked_period_is_audit_logged(self):
        """Superuser override delete in a locked period creates an audit log entry."""
        from plugins.audit_log.models import AuditLog
        superuser = User.objects.create_user(
            username='sb-super-audit', password='testpass', is_staff=True, is_superuser=True,
        )
        self.client.force_authenticate(user=superuser)
        response = self.client.delete(
            f'/api/standby/logs/{self.past_log.id}/?ignore_date_filter=true'
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        entry = AuditLog.objects.filter(
            user=superuser, action='superuser_override_delete',
        ).first()
        self.assertIsNotNone(entry, 'Audit log entry for superuser override delete was not created.')
        self.assertIn('StandbyLog', entry.description)
        self.assertIn(str(self.past_log.id), entry.description)

    def test_superuser_delete_current_month_not_audit_logged(self):
        """Superuser delete in the current (open) month is NOT audit-logged."""
        from plugins.audit_log.models import AuditLog
        superuser = User.objects.create_user(
            username='sb-super-current', password='testpass', is_staff=True, is_superuser=True,
        )
        self.client.force_authenticate(user=superuser)
        response = self.client.delete(
            f'/api/standby/logs/{self.current_log.id}/?ignore_date_filter=true'
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        exists = AuditLog.objects.filter(
            user=superuser, action='superuser_override_delete',
        ).exists()
        self.assertFalse(exists, 'Current-month delete should not be audit-logged as an override.')

    def test_staff_bulk_delete_blocks_past_month_approved(self):
        """is_staff bulk_delete cannot delete approved past-month records."""
        self.client.force_authenticate(user=self.staff)
        response = self.client.post(
            '/api/standby/logs/bulk_delete/',
            {'ids': [self.past_log.id]},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['deleted_count'], 0)
        self.assertIn(self.past_log.id, response.data['failed_ids'])
        self.assertTrue(StandbyLog.objects.filter(id=self.past_log.id).exists())

    def test_superuser_bulk_delete_can_delete_past_month_approved(self):
        """is_superuser bulk_delete can delete approved past-month records."""
        superuser = User.objects.create_user(
            username='sb-super-bulk', password='testpass', is_staff=True, is_superuser=True,
        )
        self.client.force_authenticate(user=superuser)
        response = self.client.post(
            '/api/standby/logs/bulk_delete/',
            {'ids': [self.past_log.id]},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['deleted_count'], 1)
        self.assertFalse(StandbyLog.objects.filter(id=self.past_log.id).exists())


class StandbyLogExportTests(TestCase):
    """The /standby/logs/export/ endpoint streams the full filtered set as CSV.

    Regression guards:
    - No 10k row ceiling (the old ``page_size=10000`` cap is bypassed).
    - Filter parity with the list endpoint (status, personal scope).
    - Fractional hours preserved (``String(Number(l.hours))`` semantics).
    """

    def setUp(self):
        self.client = APIClient()
        self.staff = User.objects.create_user(
            username='sb-export-staff', password='testpass', is_staff=True,
        )
        self.employee = User.objects.create_user(
            username='sb-export-emp', password='testpass',
            first_name='Export', last_name='Employee',
        )
        self.other = User.objects.create_user(
            username='sb-export-other', password='testpass',
        )

    def test_export_returns_csv(self):
        StandbyLog.objects.create(
            user=self.employee, date=date(2026, 6, 1),
            hours=4, status='approved', description='SB export test',
        )
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(
            '/api/standby/logs/export/', {'ignore_date_filter': 'true'},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'text/csv')
        body = _streaming_body(response)
        header = body.split('\r\n')[0]
        self.assertIn('User', header)
        self.assertIn('Date', header)
        self.assertIn('Hours', header)
        # StandbyLogSerializer uses user.get_full_name() for user_name.
        self.assertIn('Export Employee', body)

    def test_export_respects_status_filter(self):
        StandbyLog.objects.create(
            user=self.employee, date=date(2026, 6, 1),
            hours=4, status='approved',
        )
        StandbyLog.objects.create(
            user=self.employee, date=date(2026, 6, 2),
            hours=2, status='pending',
        )
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(
            '/api/standby/logs/export/',
            {'status': 'approved', 'ignore_date_filter': 'true'},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = _streaming_body(response)
        lines = [ln for ln in body.split('\r\n') if ln]
        self.assertEqual(len(lines), 2)  # header + 1 data row

    def test_export_respects_personal_scope(self):
        """Non-staff users only see their own logs in the export."""
        StandbyLog.objects.create(
            user=self.employee, date=date(2026, 6, 1),
            hours=4, status='approved',
        )
        StandbyLog.objects.create(
            user=self.other, date=date(2026, 6, 1),
            hours=3, status='approved',
        )
        self.client.force_authenticate(user=self.employee)
        response = self.client.get(
            '/api/standby/logs/export/', {'ignore_date_filter': 'true'},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = _streaming_body(response)
        self.assertIn('Export Employee', body)
        self.assertNotIn('sb-export-other', body)

    def test_export_streams_full_dataset(self):
        """1200 rows must all appear in the CSV (no 10k cap, no truncation)."""
        # StandbyLog has a unique constraint on (user, date), so spread
        # across multiple users + dates to create 1200 unique rows.
        from datetime import timedelta
        users = [self.employee, self.other, self.staff]
        base_date = date(2025, 1, 1)
        logs = [
            StandbyLog(
                user=users[i % 3],
                date=base_date + timedelta(days=i // 3),
                hours=2, status='approved',
            )
            for i in range(1200)
        ]
        StandbyLog.objects.bulk_create(logs)
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(
            '/api/standby/logs/export/', {'ignore_date_filter': 'true'},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = _streaming_body(response)
        lines = [ln for ln in body.split('\r\n') if ln]
        # header + 1200 data rows. Staff sees all (export is in
        # staff_global_view_actions), so all 1200 rows appear.
        self.assertEqual(len(lines), 1201)

    def test_export_preserves_fractional_hours(self):
        """Hours serialized to match ``String(Number(l.hours))``."""
        StandbyLog.objects.create(
            user=self.employee, date=date(2026, 6, 1),
            hours=1.5, status='approved',
        )
        StandbyLog.objects.create(
            user=self.employee, date=date(2026, 6, 2),
            hours=2, status='approved',
        )
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(
            '/api/standby/logs/export/', {'ignore_date_filter': 'true'},
        )
        body = _streaming_body(response)
        data_lines = [ln for ln in body.split('\r\n') if ln][1:]
        hours_values = [ln.split(',')[2] for ln in data_lines]
        self.assertIn('1.5', hours_values)
        self.assertIn('2', hours_values)
        # Ensure no trailing-zero formats like "1.50" or "2.0".
        self.assertNotIn('1.50', hours_values)
        self.assertNotIn('2.0', hours_values)

    def test_export_returns_only_headers_when_empty(self):
        """Empty queryset returns CSV with BOM + header row only."""
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(
            '/api/standby/logs/export/',
            {'status': 'approved', 'date': '2099-01-01'},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = _streaming_body(response)
        lines = [ln for ln in body.split('\r\n') if ln]
        self.assertEqual(len(lines), 1)  # BOM+header only

    def test_export_respects_user_filter(self):
        """Staff can filter export by specific user via filterset."""
        StandbyLog.objects.create(
            user=self.employee, date=date(2026, 6, 1),
            hours=4, status='approved',
        )
        StandbyLog.objects.create(
            user=self.other, date=date(2026, 6, 1),
            hours=3, status='approved',
        )
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(
            '/api/standby/logs/export/',
            {'user': str(self.employee.id), 'ignore_date_filter': 'true'},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = _streaming_body(response)
        self.assertIn('Export Employee', body)
        self.assertNotIn('sb-export-other', body)

    def test_export_includes_utf8_bom(self):
        """CSV must start with UTF-8 BOM for Excel compatibility."""
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(
            '/api/standby/logs/export/', {'ignore_date_filter': 'true'},
        )
        body = _streaming_body(response)
        self.assertTrue(body.startswith('\ufeff'), 'CSV must start with UTF-8 BOM')


class StandbyOverlapValidationTests(TestCase):
    """Time-overlap validation replaces the old unique_standby_per_day
    constraint. A user can have multiple standby entries on the same date
    if time ranges don't overlap."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='sb-overlap', password='testpass')
        self.client.force_authenticate(user=self.user)

    def test_multiple_non_overlapping_same_date(self):
        """Two non-overlapping standby entries on the same date succeed."""
        r1 = self.client.post('/api/standby/logs/', {
            'date': '2026-07-10',
            'start_time': '09:00', 'end_time': '10:00',
        })
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED, r1.content)
        r2 = self.client.post('/api/standby/logs/', {
            'date': '2026-07-10',
            'start_time': '14:00', 'end_time': '15:00',
        })
        self.assertEqual(r2.status_code, status.HTTP_201_CREATED, r2.content)

    def test_overlapping_same_date_rejected(self):
        """Overlapping standby entries on the same date are rejected."""
        self.client.post('/api/standby/logs/', {
            'date': '2026-07-10',
            'start_time': '09:00', 'end_time': '10:00',
        })
        r2 = self.client.post('/api/standby/logs/', {
            'date': '2026-07-10',
            'start_time': '09:30', 'end_time': '10:30',
        })
        self.assertEqual(r2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('overlaps', str(r2.data).lower())

    def test_rejected_entry_does_not_block_same_time_slot(self):
        """A rejected standby entry releases its time slot."""
        r1 = self.client.post('/api/standby/logs/', {
            'date': '2026-07-10',
            'start_time': '09:00', 'end_time': '10:00',
        })
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED, r1.content)
        log = StandbyLog.objects.get()
        log.status = 'rejected'
        log.save()
        r2 = self.client.post('/api/standby/logs/', {
            'date': '2026-07-10',
            'start_time': '09:00', 'end_time': '10:00',
        })
        self.assertEqual(r2.status_code, status.HTTP_201_CREATED, r2.content)


class StandbyClientsM2MTests(TestCase):
    """StandbyLog.clients M2M field allows multiple clients per standby entry."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='sb-clients', password='testpass')
        self.client_a = Client.objects.create(name='SB Client A', code='SBA')
        self.client_b = Client.objects.create(name='SB Client B', code='SBB')
        self.client.force_authenticate(user=self.user)

    def test_create_with_multiple_clients(self):
        """Creating a standby entry with multiple client_ids attaches all clients."""
        r = self.client.post('/api/standby/logs/', {
            'date': '2026-07-10',
            'start_time': '09:00', 'end_time': '17:00',
            'client_ids': [self.client_a.id, self.client_b.id],
        })
        self.assertEqual(r.status_code, status.HTTP_201_CREATED, r.content)
        log = StandbyLog.objects.get()
        self.assertEqual(set(log.clients.values_list('id', flat=True)),
                         {self.client_a.id, self.client_b.id})

    def test_create_without_clients(self):
        """Creating a standby entry without client_ids leaves clients empty."""
        r = self.client.post('/api/standby/logs/', {
            'date': '2026-07-10',
            'start_time': '09:00', 'end_time': '17:00',
        })
        self.assertEqual(r.status_code, status.HTTP_201_CREATED, r.content)
        log = StandbyLog.objects.get()
        self.assertEqual(log.clients.count(), 0)

    def test_create_with_nonexistent_client_id_rejected(self):
        """Passing a non-existent client ID returns 400, not 500."""
        r = self.client.post('/api/standby/logs/', {
            'date': '2026-07-10',
            'start_time': '09:00', 'end_time': '17:00',
            'client_ids': [self.client_a.id, 99999],
        })
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('99999', str(r.data))

    def test_serializer_returns_client_ids(self):
        """The standby serializer returns client_ids and client_names."""
        log = StandbyLog.objects.create(
            user=self.user, date=date.today(),
            start_time=time(9, 0), end_time=time(17, 0), hours=8,
        )
        log.clients.set([self.client_a, self.client_b])
        self.client.force_authenticate(user=self.user)
        r = self.client.get(f'/api/standby/logs/{log.id}/?ignore_date_filter=true')
        self.assertEqual(r.status_code, status.HTTP_200_OK, r.content)
        self.assertEqual(set(r.data['client_ids']), {self.client_a.id, self.client_b.id})
        self.assertEqual(set(r.data['client_names']), {'SB Client A', 'SB Client B'})


class StandbyPayrollGuardTests(TestCase):
    """Deletion must be blocked when a PayrollRunEntry references the record."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='sb-pay', password='testpass')
        self.log = StandbyLog.objects.create(
            user=self.user, date=date.today(),
            start_time=time(9, 0), end_time=time(17, 0), hours=8,
            status='pending',
        )

    def test_cannot_delete_record_referenced_by_payroll(self):
        """If a PayrollRunEntry references this record, deletion returns 400."""
        from unittest.mock import patch, MagicMock
        mock_qs = MagicMock()
        mock_qs.exists.return_value = True
        with patch(
            'plugins.payroll.models.PayrollRunEntry.objects.filter',
            return_value=mock_qs,
        ):
            self.client.force_authenticate(user=self.user)
            r = self.client.delete(
                f'/api/standby/logs/{self.log.id}/?ignore_date_filter=true'
            )
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(StandbyLog.objects.filter(id=self.log.id).exists())

    def test_finalized_source_cannot_be_edited_rejected_or_deleted(self):
        mock_qs = MagicMock()
        mock_qs.exists.return_value = True
        self.client.force_authenticate(user=self.user)
        with patch(
            'plugins.payroll.models.PayrollRunEntry.objects.filter',
            return_value=mock_qs,
        ):
            update = self.client.patch(
                f'/api/standby/logs/{self.log.id}/?ignore_date_filter=true', {'description': 'changed'},
                format='json',
            )
        self.assertEqual(update.status_code, status.HTTP_400_BAD_REQUEST)

        staff = User.objects.create_user(username='sb-pay-staff', password='testpass', is_staff=True)
        self.client.force_authenticate(user=staff)
        with patch(
            'plugins.payroll.models.PayrollRunEntry.objects.filter',
            return_value=mock_qs,
        ):
            reject = self.client.post(
                f'/api/standby/logs/{self.log.id}/reject/', {'rejection_reason': 'correction'},
                format='json',
            )
        self.assertEqual(reject.status_code, status.HTTP_400_BAD_REQUEST)

        self.client.force_authenticate(user=self.user)
        with patch(
            'plugins.payroll.models.PayrollRunEntry.objects.filter',
            return_value=mock_qs,
        ):
            delete = self.client.delete(
                f'/api/standby/logs/{self.log.id}/?ignore_date_filter=true',
            )
        self.assertEqual(delete.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(StandbyLog.objects.filter(pk=self.log.pk).exists())

    def test_draft_source_can_still_be_edited(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            f'/api/standby/logs/{self.log.id}/?ignore_date_filter=true', {'description': 'changed', 'hours': 8}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_admin_blocks_finalized_source_mutations(self):
        from django.contrib import admin
        from apps.standby.admin import StandbyLogAdmin

        mock_qs = MagicMock()
        mock_qs.exists.return_value = True
        model_admin = StandbyLogAdmin(StandbyLog, admin.site)
        with patch(
            'plugins.payroll.models.PayrollRunEntry.objects.filter',
            return_value=mock_qs,
        ):
            with self.assertRaises(ValidationError):
                model_admin.save_model(None, self.log, None, True)
            with self.assertRaises(ValidationError):
                model_admin.delete_model(None, self.log)

    def test_can_delete_record_not_referenced_by_payroll(self):
        """Pending record with no payroll reference is deletable."""
        self.client.force_authenticate(user=self.user)
        r = self.client.delete(
            f'/api/standby/logs/{self.log.id}/?ignore_date_filter=true'
        )
        self.assertEqual(r.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(StandbyLog.objects.filter(id=self.log.id).exists())
