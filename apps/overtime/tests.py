"""
Tests for overtime app.
"""

from datetime import date
from uuid import uuid4
from unittest.mock import MagicMock, patch

from django.http import StreamingHttpResponse
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from .models import OvertimeLog, Client
from apps.dashboard.models.calendar import CalendarWorkspace
from apps.users.models import Team, TeamMembership


def _streaming_body(response) -> str:
    """Materialize a StreamingHttpResponse body as text."""
    if isinstance(response, StreamingHttpResponse):
        return b"".join(response.streaming_content).decode("utf-8")
    return response.content.decode("utf-8")


class OvertimeLogViewSetTests(TestCase):
    """Test OvertimeLogViewSet CRUD operations and approval workflow."""

    def setUp(self):
        """Set up test data."""
        self.client = APIClient()
        self.user = User.objects.create_user(username='testuser', password='testpass')
        self.staff_user = User.objects.create_user(username='staff', password='testpass', is_staff=True)
        self.client_obj = Client.objects.create(name='Test Client', code='TC001')
        self.client.force_authenticate(user=self.user)

    def _create_workspace(self):
        return CalendarWorkspace.objects.create(name='Default Workspace', code='ot-ws', is_public=True)

    def test_create_overtime_log(self):
        """Test creating an overtime log."""
        data = {
            'date': '2026-05-09',
            'hours': 8.5,
            'description': 'Test overtime',
            'client': self.client_obj.id
        }
        response = self.client.post('/api/overtime/logs/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(OvertimeLog.objects.count(), 1)

    def test_create_overtime_log_staff_override(self):
        """Test staff user can override user field."""
        self.client.force_authenticate(user=self.staff_user)
        data = {
            'date': '2026-05-09',
            'hours': 8.5,
            'description': 'Test overtime',
            'client': self.client_obj.id,
            'user': self.user.id
        }
        response = self.client.post('/api/overtime/logs/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        log = OvertimeLog.objects.first()
        self.assertEqual(log.user, self.user)

    def test_approve_overtime_log(self):
        """Test approving an overtime log."""
        log = OvertimeLog.objects.create(
            user=self.user,
            date='2026-05-09',
            hours=8.5,
            description='Test overtime',
            client=self.client_obj,
            status='pending'
        )
        self.client.force_authenticate(user=self.staff_user)
        response = self.client.post(f'/api/overtime/logs/{log.id}/approve/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        log.refresh_from_db()
        self.assertEqual(log.status, 'approved')

    def test_team_logs_without_workspace_scope(self):
        """team_logs without workspace_ids returns all team members' entries."""
        self.client.force_authenticate(user=self.staff_user)
        response = self.client.get('/api/overtime/logs/team_logs/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        workspace = self._create_workspace()
        response = self.client.get('/api/overtime/logs/team_logs/', {'workspace_ids': str(workspace.id)})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_admin_logs_allows_staff_admin(self):
        """Staff admins (non-superuser) can read admin_logs — matches the
        /admin/overtime-logs page guard (SuperuserRoute admits staff admins)."""
        self.client.force_authenticate(user=self.staff_user)
        response = self.client.get('/api/overtime/logs/admin_logs/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_admin_logs_allows_hr_read_only(self):
        """HR has view-all access per the HRReadOnlyMixin architecture and is
        admitted to the admin pages by the route guard — the GET-only
        admin_logs endpoint must accept HR as well."""
        hr_user = User.objects.create_user(username='ot-hr', password='testpass')
        profile = hr_user.profile
        profile.is_hr_user = True
        profile.save()
        self.client.force_authenticate(user=hr_user)
        response = self.client.get('/api/overtime/logs/admin_logs/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_admin_logs_forbidden_for_regular_user(self):
        """Regular (non-staff, non-HR) users are still blocked from admin_logs."""
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/overtime/logs/admin_logs/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_regular_team_member_is_forbidden_from_team_logs(self):
        """Regular team members must receive 403 when hitting team endpoints."""
        teammate = User.objects.create_user(username='ot-teammate', password='testpass')
        team = Team.objects.create(name='OT Team', code=f'OT{uuid4().hex[:8]}')
        TeamMembership.objects.create(user_profile=self.user.profile, team=team, is_primary_team=True)
        TeamMembership.objects.create(user_profile=teammate.profile, team=team)
        workspace = CalendarWorkspace.objects.create(
            name='OT Workspace',
            code=f'ot-ws-{uuid4().hex[:8]}',
            team=team,
            is_public=False,
        )

        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/overtime/logs/team_logs/', {'workspace_ids': str(workspace.id)})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.data)

    def test_user_without_team_is_blocked_from_team_logs(self):
        """Users with no team membership should receive 403 on team logs."""
        team = Team.objects.create(name='Other Team', code=f'OT{uuid4().hex[8:16]}')
        workspace = CalendarWorkspace.objects.create(
            name='Other Workspace',
            code=f'ot-ws-{uuid4().hex[8:]}',
            team=team,
            is_public=False,
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/overtime/logs/team_logs/', {'workspace_ids': str(workspace.id)})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.data)

    def test_team_pending_without_workspace_scope(self):
        """team_pending without workspace_ids returns all team members' pending entries."""
        self.client.force_authenticate(user=self.staff_user)
        response = self.client.get('/api/overtime/logs/team_pending/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        workspace = self._create_workspace()
        response = self.client.get('/api/overtime/logs/team_pending/', {'workspace_ids': str(workspace.id)})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_team_pending_months_groups_by_month(self):
        """team_pending_months returns months with pending counts, sorted ascending."""
        OvertimeLog.objects.create(
            user=self.user, date=date(2026, 3, 15), hours=2,
            description='Mar', client=self.client_obj, status='pending',
        )
        OvertimeLog.objects.create(
            user=self.user, date=date(2026, 3, 20), hours=3,
            description='Mar2', client=self.client_obj, status='pending',
        )
        OvertimeLog.objects.create(
            user=self.user, date=date(2026, 1, 10), hours=4,
            description='Jan', client=self.client_obj, status='pending',
        )
        OvertimeLog.objects.create(
            user=self.user, date=date(2026, 2, 5), hours=1,
            description='Approved', client=self.client_obj, status='approved',
        )
        self.client.force_authenticate(user=self.staff_user)
        response = self.client.get('/api/overtime/logs/team_pending_months/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        months = response.data
        self.assertEqual(len(months), 2)
        self.assertEqual(months[0]['month'], '2026-01-01')
        self.assertEqual(months[0]['count'], 1)
        self.assertEqual(months[1]['month'], '2026-03-01')
        self.assertEqual(months[1]['count'], 2)

    def test_regular_user_only_sees_personal_logs(self):
        """Personal endpoint must only return the authenticated user's logs."""
        other_user = User.objects.create_user(username='other', password='testpass')
        OvertimeLog.objects.create(
            user=self.user,
            date=date.today(),
            hours=2,
            description='Mine',
            client=self.client_obj,
        )
        OvertimeLog.objects.create(
            user=other_user,
            date=date.today(),
            hours=4,
            description='Not mine',
            client=self.client_obj,
        )

        response = self.client.get('/api/overtime/logs/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['user'], self.user.id)

    def test_staff_user_still_sees_only_their_logs(self):
        """Staff users should also be scoped to their own data on personal endpoints."""
        other_user = User.objects.create_user(username='other-staff', password='testpass')
        OvertimeLog.objects.create(
            user=self.staff_user,
            date=date.today(),
            hours=3,
            description='Staff entry',
            client=self.client_obj,
        )
        OvertimeLog.objects.create(
            user=other_user,
            date=date.today(),
            hours=5,
            description='Should be hidden',
            client=self.client_obj,
        )

        self.client.force_authenticate(user=self.staff_user)
        response = self.client.get('/api/overtime/logs/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['user'], self.staff_user.id)

    def test_personal_logs_ignore_workspace_scope_mismatch(self):
        """workspace_ids filter must never hide the requester's own overtime logs."""
        foreign_workspace = CalendarWorkspace.objects.create(
            name='Foreign OT Workspace',
            code=f'ot-ws-{uuid4().hex[:6]}',
            is_public=False,
        )
        other_user = User.objects.create_user(username='other-ws', password='testpass')
        OvertimeLog.objects.create(
            user=self.user,
            date=date.today(),
            hours=2,
            description='Should always be visible',
            client=self.client_obj,
        )
        OvertimeLog.objects.create(
            user=other_user,
            date=date.today(),
            hours=4,
            description='Not mine',
            client=self.client_obj,
        )

        response = self.client.get(
            '/api/overtime/logs/',
            {'workspace_ids': str(foreign_workspace.id)}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['user'], self.user.id)


class ClientVisibilityTests(TestCase):
    """Test that ClientViewSet scopes clients to the user's profile.clients.

    Non-admin users must only see clients assigned to their profile.
    Staff/superusers see all clients for administrative management.
    """

    def setUp(self):
        self.api_client = APIClient()
        self.user = User.objects.create_user(username='regular', password='testpass')
        self.staff = User.objects.create_user(username='staff', password='testpass', is_staff=True)
        self.assigned = Client.objects.create(name='Assigned Client', code='ASG001')
        self.unassigned = Client.objects.create(name='Unassigned Client', code='UNA001')
        # Assign only one client to the regular user
        self.user.profile.clients.add(self.assigned)

    def test_regular_user_sees_only_assigned_clients(self):
        """Regular user sees only clients assigned to their profile."""
        self.api_client.force_authenticate(user=self.user)
        response = self.api_client.get('/api/overtime/clients/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        client_ids = {c['id'] for c in response.data['results']}
        self.assertIn(self.assigned.id, client_ids)
        self.assertNotIn(self.unassigned.id, client_ids)

    def test_staff_sees_all_clients(self):
        """Staff user sees all clients for administrative management."""
        self.api_client.force_authenticate(user=self.staff)
        response = self.api_client.get('/api/overtime/clients/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        client_ids = {c['id'] for c in response.data['results']}
        self.assertIn(self.assigned.id, client_ids)
        self.assertIn(self.unassigned.id, client_ids)

    def test_user_with_no_clients_sees_empty_list(self):
        """User with no clients assigned sees an empty list, not all clients."""
        no_clients_user = User.objects.create_user(username='no_clients', password='testpass')
        self.api_client.force_authenticate(user=no_clients_user)
        response = self.api_client.get('/api/overtime/clients/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 0)


class OvertimeMonthlyLockTests(TestCase):
    """Test the MonthlyLockMixin on OvertimeLogViewSet.

    Owners cannot edit/delete records whose ``date`` is in a strictly past
    month. Admins/superusers bypass. Approve/reject are exempt.
    """

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='owner', password='testpass')
        self.staff = User.objects.create_user(username='admin', password='testpass', is_staff=True)
        self.client_obj = Client.objects.create(name='Lock Client', code='LC001')
        today = date.today()
        past_month_date = (
            date(today.year, today.month - 1, 15) if today.month > 1
            else date(today.year - 1, 12, 15)
        )
        # Past-month approved record owned by the regular user (locked for delete)
        self.past_log = OvertimeLog.objects.create(
            user=self.user,
            date=past_month_date,
            hours=2,
            description='Past month approved',
            client=self.client_obj,
            status='approved',
        )
        # Past-month pending record owned by the regular user (deletable even from past month)
        self.past_pending_log = OvertimeLog.objects.create(
            user=self.user,
            date=past_month_date,
            hours=2,
            description='Past month pending',
            client=self.client_obj,
            status='pending',
        )
        # Current-month record owned by the regular user
        self.current_log = OvertimeLog.objects.create(
            user=self.user,
            date=today,
            hours=3,
            description='Current month',
            client=self.client_obj,
            status='pending',
        )
        # Past-month record owned by the admin (for admin-bypass individual tests)
        self.staff_past_log = OvertimeLog.objects.create(
            user=self.staff,
            date=past_month_date,
            hours=4,
            description='Staff past month',
            client=self.client_obj,
            status='pending',
        )
        # Past-month approved record owned by the admin (for is_staff delete-lock test)
        self.staff_past_approved_log = OvertimeLog.objects.create(
            user=self.staff,
            date=past_month_date,
            hours=3,
            description='Staff past month approved',
            client=self.client_obj,
            status='approved',
        )

    def test_owner_cannot_delete_past_month_approved_record(self):
        """Owner DELETE on a past-month approved record (ignore_date_filter) is 403."""
        self.client.force_authenticate(user=self.user)
        response = self.client.delete(
            f'/api/overtime/logs/{self.past_log.id}/?ignore_date_filter=true'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(OvertimeLog.objects.filter(id=self.past_log.id).exists())

    def test_owner_can_delete_past_month_pending_record(self):
        """Owner DELETE on a past-month pending record is 204 — pending records
        can be deleted even from a past month (carryover leverage)."""
        self.client.force_authenticate(user=self.user)
        response = self.client.delete(
            f'/api/overtime/logs/{self.past_pending_log.id}/?ignore_date_filter=true'
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(OvertimeLog.objects.filter(id=self.past_pending_log.id).exists())

    def test_owner_cannot_update_past_month_record(self):
        """Owner PATCH on a past-month record (ignore_date_filter) is 403 —
        updates are still locked even for pending records."""
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            f'/api/overtime/logs/{self.past_pending_log.id}/?ignore_date_filter=true',
            {'description': 'changed'},
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.past_pending_log.refresh_from_db()
        self.assertEqual(self.past_pending_log.description, 'Past month pending')

    def test_owner_can_delete_current_month_record(self):
        """Owner DELETE on a current-month record is 204."""
        self.client.force_authenticate(user=self.user)
        response = self.client.delete(
            f'/api/overtime/logs/{self.current_log.id}/?ignore_date_filter=true'
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(OvertimeLog.objects.filter(id=self.current_log.id).exists())

    def test_admin_can_delete_past_month_record(self):
        """Admin bypasses the month lock and can delete their own past-month records."""
        self.client.force_authenticate(user=self.staff)
        response = self.client.delete(
            f'/api/overtime/logs/{self.staff_past_log.id}/?ignore_date_filter=true'
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(OvertimeLog.objects.filter(id=self.staff_past_log.id).exists())

    def test_admin_can_update_past_month_record(self):
        """Admin bypasses the month lock and can update their own past-month records."""
        self.client.force_authenticate(user=self.staff)
        response = self.client.patch(
            f'/api/overtime/logs/{self.staff_past_log.id}/?ignore_date_filter=true',
            {'description': 'admin-changed'},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.staff_past_log.refresh_from_db()
        self.assertEqual(self.staff_past_log.description, 'admin-changed')

    def test_bulk_delete_includes_past_month_pending_for_owner(self):
        """Owner bulk_delete now includes pending past-month records."""
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            '/api/overtime/logs/bulk_delete/',
            {'ids': [self.past_log.id, self.past_pending_log.id, self.current_log.id]},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # pending past + current = 2 deleted; approved past = 1 failed
        self.assertEqual(response.data['deleted_count'], 2)
        self.assertIn(self.past_log.id, response.data['failed_ids'])
        self.assertFalse(OvertimeLog.objects.filter(id=self.past_pending_log.id).exists())
        self.assertFalse(OvertimeLog.objects.filter(id=self.current_log.id).exists())
        self.assertTrue(OvertimeLog.objects.filter(id=self.past_log.id).exists())

    def test_bulk_delete_past_month_allowed_for_admin(self):
        """Admin bulk_delete can delete past-month records (bypass)."""
        self.client.force_authenticate(user=self.staff)
        response = self.client.post(
            '/api/overtime/logs/bulk_delete/',
            {'ids': [self.staff_past_log.id]},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['deleted_count'], 1)
        self.assertFalse(OvertimeLog.objects.filter(id=self.staff_past_log.id).exists())

    def test_approve_past_month_record_is_exempt(self):
        """Approve on a past-month record is NOT locked (exempt action)."""
        self.client.force_authenticate(user=self.staff)
        response = self.client.post(f'/api/overtime/logs/{self.past_log.id}/approve/')
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
            f'/api/overtime/logs/{self.staff_past_approved_log.id}/?ignore_date_filter=true'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(OvertimeLog.objects.filter(id=self.staff_past_approved_log.id).exists())

    def test_superuser_can_delete_past_month_approved_record(self):
        """is_superuser can delete an approved past-month record (override)."""
        superuser = User.objects.create_user(
            username='super', password='testpass', is_staff=True, is_superuser=True,
        )
        self.client.force_authenticate(user=superuser)
        response = self.client.delete(
            f'/api/overtime/logs/{self.past_log.id}/?ignore_date_filter=true'
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(OvertimeLog.objects.filter(id=self.past_log.id).exists())

    def test_superuser_delete_in_locked_period_is_audit_logged(self):
        """Superuser override delete in a locked period creates an audit log entry."""
        from plugins.audit_log.models import AuditLog
        superuser = User.objects.create_user(
            username='super-audit', password='testpass', is_staff=True, is_superuser=True,
        )
        self.client.force_authenticate(user=superuser)
        response = self.client.delete(
            f'/api/overtime/logs/{self.past_log.id}/?ignore_date_filter=true'
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        entry = AuditLog.objects.filter(
            user=superuser, action='superuser_override_delete',
        ).first()
        self.assertIsNotNone(entry, 'Audit log entry for superuser override delete was not created.')
        self.assertIn('OvertimeLog', entry.description)
        self.assertIn(str(self.past_log.id), entry.description)

    def test_superuser_delete_current_month_not_audit_logged(self):
        """Superuser delete in the current (open) month is NOT audit-logged."""
        from plugins.audit_log.models import AuditLog
        superuser = User.objects.create_user(
            username='super-current', password='testpass', is_staff=True, is_superuser=True,
        )
        self.client.force_authenticate(user=superuser)
        response = self.client.delete(
            f'/api/overtime/logs/{self.current_log.id}/?ignore_date_filter=true'
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
            '/api/overtime/logs/bulk_delete/',
            {'ids': [self.past_log.id]},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['deleted_count'], 0)
        self.assertIn(self.past_log.id, response.data['failed_ids'])
        self.assertTrue(OvertimeLog.objects.filter(id=self.past_log.id).exists())

    def test_superuser_bulk_delete_can_delete_past_month_approved(self):
        """is_superuser bulk_delete can delete approved past-month records."""
        superuser = User.objects.create_user(
            username='super-bulk', password='testpass', is_staff=True, is_superuser=True,
        )
        self.client.force_authenticate(user=superuser)
        response = self.client.post(
            '/api/overtime/logs/bulk_delete/',
            {'ids': [self.past_log.id]},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['deleted_count'], 1)
        self.assertFalse(OvertimeLog.objects.filter(id=self.past_log.id).exists())


class OvertimeLogExportTests(TestCase):
    """The /overtime/logs/export/ endpoint streams the full filtered set as CSV.

    Regression guards:
    - No 10k row ceiling (the old ``page_size=10000`` cap is bypassed).
    - Filter parity with the list endpoint (status, personal scope).
    - Hours serialized as ``int(obj.hours)`` to match the serializer.
    """

    def setUp(self):
        self.client = APIClient()
        self.staff = User.objects.create_user(
            username='export-staff', password='testpass', is_staff=True,
        )
        self.employee = User.objects.create_user(
            username='export-emp', password='testpass',
        )
        self.other = User.objects.create_user(
            username='export-other', password='testpass',
        )
        self.client_obj = Client.objects.create(name='Export Client', code='EXP')

    def test_export_returns_csv(self):
        OvertimeLog.objects.create(
            user=self.employee, client=self.client_obj,
            date=date(2026, 6, 1), hours=4, status='approved',
            description='OT export test',
        )
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(
            '/api/overtime/logs/export/', {'ignore_date_filter': 'true'},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'text/csv')
        body = _streaming_body(response)
        header = body.split('\r\n')[0]
        self.assertIn('User', header)
        self.assertIn('Date', header)
        self.assertIn('Client', header)
        self.assertIn('Hours', header)
        self.assertIn('export-emp', body)

    def test_export_respects_status_filter(self):
        OvertimeLog.objects.create(
            user=self.employee, client=self.client_obj,
            date=date(2026, 6, 1), hours=4, status='approved',
        )
        OvertimeLog.objects.create(
            user=self.employee, client=self.client_obj,
            date=date(2026, 6, 2), hours=2, status='pending',
        )
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(
            '/api/overtime/logs/export/',
            {'status': 'approved', 'ignore_date_filter': 'true'},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = _streaming_body(response)
        # Only the approved row should appear (date 01/06/2026).
        lines = [ln for ln in body.split('\r\n') if ln]
        self.assertEqual(len(lines), 2)  # header + 1 data row

    def test_export_respects_personal_scope(self):
        """Non-staff users only see their own logs in the export."""
        OvertimeLog.objects.create(
            user=self.employee, client=self.client_obj,
            date=date(2026, 6, 1), hours=4, status='approved',
        )
        OvertimeLog.objects.create(
            user=self.other, client=self.client_obj,
            date=date(2026, 6, 1), hours=3, status='approved',
        )
        self.client.force_authenticate(user=self.employee)
        response = self.client.get(
            '/api/overtime/logs/export/', {'ignore_date_filter': 'true'},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = _streaming_body(response)
        self.assertIn('export-emp', body)
        self.assertNotIn('export-other', body)

    def test_export_streams_full_dataset(self):
        """1200 rows must all appear in the CSV (no 10k cap, no truncation)."""
        # OvertimeLog has a unique constraint on (user, date, client),
        # so spread across multiple users + dates to create 1200 unique rows.
        from datetime import timedelta
        users = [self.employee, self.other, self.staff]
        base_date = date(2025, 1, 1)
        logs = [
            OvertimeLog(
                user=users[i % 3], client=self.client_obj,
                date=base_date + timedelta(days=i // 3),
                hours=2, status='approved',
            )
            for i in range(1200)
        ]
        OvertimeLog.objects.bulk_create(logs)
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(
            '/api/overtime/logs/export/', {'ignore_date_filter': 'true'},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = _streaming_body(response)
        lines = [ln for ln in body.split('\r\n') if ln]
        # header + 1200 data rows. Staff sees all (export is in
        # staff_global_view_actions), so all 1200 rows appear.
        self.assertEqual(len(lines), 1201)

    def test_export_preserves_integer_hours(self):
        """Hours are serialized as ``int(obj.hours)`` to match the serializer."""
        OvertimeLog.objects.create(
            user=self.employee, client=self.client_obj,
            date=date(2026, 6, 1), hours=4, status='approved',
        )
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(
            '/api/overtime/logs/export/', {'ignore_date_filter': 'true'},
        )
        body = _streaming_body(response)
        # The data row should contain "4" not "4.0" or "4.00".
        data_lines = [ln for ln in body.split('\r\n') if ln][1:]
        self.assertTrue(any('4' in ln.split(',')[3] for ln in data_lines))

    def test_export_returns_only_headers_when_empty(self):
        """Empty queryset returns CSV with BOM + header row only."""
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(
            '/api/overtime/logs/export/',
            {'status': 'approved', 'date': '2099-01-01'},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = _streaming_body(response)
        lines = [ln for ln in body.split('\r\n') if ln]
        self.assertEqual(len(lines), 1)  # BOM+header only

    def test_export_respects_user_filter(self):
        """Staff can filter export by specific user via filterset."""
        OvertimeLog.objects.create(
            user=self.employee, client=self.client_obj,
            date=date(2026, 6, 1), hours=4, status='approved',
        )
        OvertimeLog.objects.create(
            user=self.other, client=self.client_obj,
            date=date(2026, 6, 1), hours=3, status='approved',
        )
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(
            '/api/overtime/logs/export/',
            {'user': str(self.employee.id), 'ignore_date_filter': 'true'},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = _streaming_body(response)
        self.assertIn('export-emp', body)
        self.assertNotIn('export-other', body)

    def test_export_includes_utf8_bom(self):
        """CSV must start with UTF-8 BOM for Excel compatibility."""
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(
            '/api/overtime/logs/export/', {'ignore_date_filter': 'true'},
        )
        body = _streaming_body(response)
        self.assertTrue(body.startswith('\ufeff'), 'CSV must start with UTF-8 BOM')

    def test_export_populates_evidence_from_ticket_references(self):
        """Ticket-type entries populate Evidence + Reference Code from ticket_references."""
        OvertimeLog.objects.create(
            user=self.employee, client=self.client_obj,
            date=date(2026, 6, 3), hours=3, status='approved',
            evidence_type='ticket',
            ticket_references=['INC-001', 'INC-002'],
        )
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(
            '/api/overtime/logs/export/', {'ignore_date_filter': 'true'},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = _streaming_body(response)
        self.assertIn('INC-001, INC-002', body)

    def test_export_preserves_existing_ticket_evidence_and_reference_code(self):
        """Structured refs fill empty columns without hiding existing values."""
        OvertimeLog.objects.create(
            user=self.employee, client=self.client_obj,
            date=date(2026, 6, 4), hours=2, status='approved',
            evidence_type='ticket',
            evidence='Legacy ticket context',
            reference_code='Legacy-REF',
            ticket_references=['INC-003'],
        )
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(
            '/api/overtime/logs/export/', {'ignore_date_filter': 'true'},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = _streaming_body(response)
        self.assertIn('Legacy ticket context', body)
        self.assertIn('Legacy-REF', body)

    def test_export_preserves_evidence_for_non_ticket_types(self):
        """Non-ticket entries keep the free-text evidence column as-is."""
        OvertimeLog.objects.create(
            user=self.employee, client=self.client_obj,
            date=date(2026, 6, 5), hours=2, status='approved',
            evidence_type='email',
            evidence='Email ref ABC',
        )
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(
            '/api/overtime/logs/export/', {'ignore_date_filter': 'true'},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = _streaming_body(response)
        self.assertIn('Email ref ABC', body)


class OvertimeOverlapValidationTests(TestCase):
    """Time-overlap validation replaces the old unique_overtime_per_day_client
    constraint. A user can have multiple OT entries on the same date for the
    same or different clients, as long as time ranges don't overlap."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='overlap-user', password='testpass')
        self.client_a = Client.objects.create(name='Client A', code='OVA')
        self.client_b = Client.objects.create(name='Client B', code='OVB')
        self.client.force_authenticate(user=self.user)

    def test_multiple_non_overlapping_same_client_same_date(self):
        """Two non-overlapping entries for the same client on the same date succeed."""
        r1 = self.client.post('/api/overtime/logs/', {
            'date': '2026-07-10', 'client': self.client_a.id,
            'start_time': '09:00', 'end_time': '10:00',
        })
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED, r1.content)
        r2 = self.client.post('/api/overtime/logs/', {
            'date': '2026-07-10', 'client': self.client_a.id,
            'start_time': '10:00', 'end_time': '11:00',
        })
        self.assertEqual(r2.status_code, status.HTTP_201_CREATED, r2.content)

    def test_overlapping_same_client_same_date_rejected(self):
        """Overlapping entries for the same client on the same date are rejected."""
        self.client.post('/api/overtime/logs/', {
            'date': '2026-07-10', 'client': self.client_a.id,
            'start_time': '09:00', 'end_time': '10:00',
        })
        r2 = self.client.post('/api/overtime/logs/', {
            'date': '2026-07-10', 'client': self.client_a.id,
            'start_time': '09:30', 'end_time': '10:30',
        })
        self.assertEqual(r2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('overlaps', str(r2.data).lower())

    def test_overlapping_different_client_same_date_rejected(self):
        """Overlapping entries for different clients on the same date are rejected."""
        self.client.post('/api/overtime/logs/', {
            'date': '2026-07-10', 'client': self.client_a.id,
            'start_time': '09:00', 'end_time': '10:00',
        })
        r2 = self.client.post('/api/overtime/logs/', {
            'date': '2026-07-10', 'client': self.client_b.id,
            'start_time': '09:30', 'end_time': '10:30',
        })
        self.assertEqual(r2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('overlaps', str(r2.data).lower())

    def test_non_overlapping_different_client_same_date_allowed(self):
        """Non-overlapping entries for different clients on the same date are allowed."""
        self.client.post('/api/overtime/logs/', {
            'date': '2026-07-10', 'client': self.client_a.id,
            'start_time': '09:00', 'end_time': '10:00',
        })
        r2 = self.client.post('/api/overtime/logs/', {
            'date': '2026-07-10', 'client': self.client_b.id,
            'start_time': '14:00', 'end_time': '15:00',
        })
        self.assertEqual(r2.status_code, status.HTTP_201_CREATED, r2.content)

    def test_entry_without_times_skips_overlap_check(self):
        """Entries without start_time/end_time skip overlap validation."""
        self.client.post('/api/overtime/logs/', {
            'date': '2026-07-10', 'client': self.client_a.id, 'hours': 4,
        })
        r2 = self.client.post('/api/overtime/logs/', {
            'date': '2026-07-10', 'client': self.client_a.id, 'hours': 3,
        })
        self.assertEqual(r2.status_code, status.HTTP_201_CREATED, r2.content)

    def test_rejected_entry_does_not_block_same_time_slot(self):
        """A rejected entry releases its time slot — a new entry with the
        same time range on the same date must be allowed."""
        # Create an entry, then reject it via the API
        r1 = self.client.post('/api/overtime/logs/', {
            'date': '2026-07-10', 'client': self.client_a.id,
            'start_time': '09:00', 'end_time': '10:00',
        })
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED, r1.content)
        log = OvertimeLog.objects.get()
        log.status = 'rejected'
        log.save()
        # Now create a new entry with the same time range
        r2 = self.client.post('/api/overtime/logs/', {
            'date': '2026-07-10', 'client': self.client_a.id,
            'start_time': '09:00', 'end_time': '10:00',
        })
        self.assertEqual(r2.status_code, status.HTTP_201_CREATED, r2.content)


class OvertimeFinalizedPayrollGuardTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='ot-pay', password='testpass')
        self.staff = User.objects.create_user(username='ot-pay-staff', password='testpass', is_staff=True)
        self.client_obj = Client.objects.create(name='Payroll Client', code='PAY-OT')
        self.log = OvertimeLog.objects.create(
            user=self.user, client=self.client_obj, date=date.today(),
            hours=2, status='approved',
        )

    def _finalized_reference(self):
        mock_qs = MagicMock()
        mock_qs.exists.return_value = True
        return patch(
            'plugins.payroll.models.PayrollRunEntry.objects.filter',
            return_value=mock_qs,
        )

    def test_finalized_source_cannot_be_edited_rejected_or_deleted(self):
        self.client.force_authenticate(user=self.user)
        with self._finalized_reference():
            update = self.client.patch(
                f'/api/overtime/logs/{self.log.id}/?ignore_date_filter=true', {'description': 'changed'},
                format='json',
            )
        self.assertEqual(update.status_code, status.HTTP_400_BAD_REQUEST)

        self.client.force_authenticate(user=self.staff)
        with self._finalized_reference():
            reject = self.client.post(
                f'/api/overtime/logs/{self.log.id}/reject/', {'rejection_reason': 'correction'},
                format='json',
            )
        self.assertEqual(reject.status_code, status.HTTP_400_BAD_REQUEST)

        self.client.force_authenticate(user=self.user)
        with self._finalized_reference():
            delete = self.client.delete(
                f'/api/overtime/logs/{self.log.id}/?ignore_date_filter=true',
            )
        self.assertEqual(delete.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(OvertimeLog.objects.filter(pk=self.log.pk).exists())

    def test_draft_source_can_still_be_edited(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            f'/api/overtime/logs/{self.log.id}/?ignore_date_filter=true', {'description': 'changed'}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)


class StructuredTicketReferenceTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='structured-user', password='testpass')
        self.client_obj = Client.objects.create(name='Structured Client', code='STRUCT')
        self.client.force_authenticate(user=self.user)

    def _payload(self, **overrides):
        payload = {
            'date': '2026-12-09',
            'hours': 2,
            'client': self.client_obj.id,
            'evidence_type': 'ticket',
            'ticket_references': [' INC-001 ', 'TICKET-002', 'inc-001'],
        }
        payload.update(overrides)
        return payload

    def test_create_deduplicates_references_and_returns_them(self):
        response = self.client.post('/api/overtime/logs/', self._payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['ticket_references'], ['INC-001', 'TICKET-002'])

    def test_legacy_payload_without_references_remains_valid(self):
        response = self.client.post(
            '/api/overtime/logs/',
            self._payload(ticket_references=[], evidence_type='other'),
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['ticket_references'], [])

    def test_invalid_reference_shape_returns_400(self):
        response = self.client.post(
            '/api/overtime/logs/', self._payload(ticket_references=['']), format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.client.post(
            '/api/overtime/logs/', self._payload(ticket_references=['X'] * 21), format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_partial_update_preserves_references_when_omitted(self):
        create = self.client.post(
            '/api/overtime/logs/', self._payload(ticket_references=['INC-100']), format='json'
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED, create.data)
        update = self.client.patch(
            f"/api/overtime/logs/{create.data['id']}/?ignore_date_filter=true",
            {'description': 'updated'},
            format='json',
        )
        self.assertEqual(update.status_code, status.HTTP_200_OK, update.data)
        self.assertEqual(update.data['ticket_references'], ['INC-100'])
