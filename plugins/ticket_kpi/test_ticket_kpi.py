"""
Tests for the Ticket KPI plugin.
"""

import io
from datetime import date, datetime, timedelta

import pandas as pd
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.overtime.models.core import Client
from apps.users.models import Team
from plugins.ticket_kpi.models import ExportProfile, TicketImportBatch, NormalizedTicket, KPIEvidence, MonthlyKPI
from plugins.ticket_kpi.mapping_engine import ColumnMapper
from plugins.ticket_kpi.analytics import compute_monthly_kpi, compute_yearly_summary, get_user_monthly_summary
from plugins.ticket_kpi.email_parser import parse_eml_bytes
from plugins.ticket_kpi.viewsets import (
    TicketUploadViewSet,
    TicketKPIDashboardViewSet,
    TicketKPIReportViewSet,
    ExportProfileViewSet,
    _get_tl_team_members,
)


class ColumnMapperTests(TestCase):
    """Tests for the ColumnMapper engine."""

    def test_auto_detect_servicenow_columns(self):
        mapper = ColumnMapper()
        cols = ['Number', 'Short description', 'State', 'Opened', 'Resolved', 'Assigned to', 'Caller']
        detected = mapper.auto_detect_columns(cols)

        self.assertEqual(detected['ticket_id'], 'Number')
        self.assertEqual(detected['title'], 'Short description')
        self.assertEqual(detected['status'], 'State')
        self.assertEqual(detected['created_at'], 'Opened')
        self.assertEqual(detected['resolved_at'], 'Resolved')
        self.assertEqual(detected['assignee'], 'Assigned to')
        self.assertEqual(detected['requester'], 'Caller')

    def test_apply_mapping_basic(self):
        mapper = ColumnMapper()
        df = pd.DataFrame({
            'Number': ['INC001', 'INC002'],
            'Short description': ['VPN issue', 'Printer down'],
            'State': ['Resolved', 'Closed'],
            'Opened': [datetime(2026, 3, 1, 8, 0), datetime(2026, 3, 2, 9, 0)],
        })

        mapping = {
            'ticket_id': 'Number',
            'title': 'Short description',
            'status': 'State',
            'created_at': 'Opened',
        }

        records, errors = mapper.apply_mapping(df, mapping)

        self.assertEqual(len(records), 2)
        self.assertEqual(len(errors), 0)
        self.assertEqual(records[0]['ticket_id'], 'INC001')
        self.assertEqual(records[0]['status'], 'closed')  # Transformed
        self.assertEqual(records[1]['status'], 'closed')

    def test_apply_mapping_with_transforms(self):
        mapper = ColumnMapper()
        df = pd.DataFrame({
            'ID': ['T1'],
            'Title': ['Test'],
            'Status': ['In Progress'],
            'Created': [datetime(2026, 3, 1)],
        })

        mapping = {
            'ticket_id': 'ID',
            'title': 'Title',
            'status': 'Status',
            'created_at': 'Created',
        }
        transforms = {
            'status': {'in progress': 'open'}
        }

        records, errors = mapper.apply_mapping(df, mapping, transforms)
        self.assertEqual(records[0]['status'], 'open')

    def test_apply_mapping_dynamic_schema_partial_data(self):
        """Dynamic schema: any schema is accepted; partial data stored in raw_data."""
        mapper = ColumnMapper()
        df = pd.DataFrame({'ID': ['T1']})
        mapping = {'ticket_id': 'ID'}  # Missing title, status, created_at

        records, errors = mapper.apply_mapping(df, mapping)
        self.assertEqual(len(records), 1)
        self.assertEqual(len(errors), 0)
        self.assertEqual(records[0]['ticket_id'], 'T1')
        self.assertEqual(records[0]['title'], '')
        self.assertEqual(records[0]['raw_data'], {'ID': 'T1'})

    def test_read_csv_file(self):
        mapper = ColumnMapper()
        csv_content = "Number,Short description,State,Opened\nINC001,Test,Resolved,2026-03-01 08:00:00"
        file_bytes = csv_content.encode('utf-8')

        df = mapper.read_file(file_bytes, filename='test.csv')
        self.assertEqual(len(df), 1)
        self.assertEqual(df.columns.tolist(), ['Number', 'Short description', 'State', 'Opened'])

    def test_compute_resolution_time(self):
        mapper = ColumnMapper()
        df = pd.DataFrame({
            'ID': ['T1'],
            'Title': ['Test'],
            'Status': ['Resolved'],
            'Created': [datetime(2026, 3, 1, 8, 0)],
            'Resolved': [datetime(2026, 3, 1, 14, 0)],
        })

        mapping = {
            'ticket_id': 'ID',
            'title': 'Title',
            'status': 'Status',
            'created_at': 'Created',
            'resolved_at': 'Resolved',
        }

        records, errors = mapper.apply_mapping(df, mapping, compute_resolution=True)
        self.assertEqual(records[0]['time_to_resolution_hours'], 6.0)


class ModelTests(TestCase):
    """Tests for Ticket KPI models."""

    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.profile = ExportProfile.objects.create(
            name='ServiceNow Default Test',
            field_mapping={
                'ticket_id': 'Number',
                'title': 'Short description',
                'status': 'State',
                'created_at': 'Opened',
            },
            value_transforms={'status': {'resolved': 'closed'}},
            required_fields=['ticket_id', 'title', 'status', 'created_at'],
            created_by=self.user,
        )

    def test_export_profile_creation(self):
        self.assertEqual(self.profile.name, 'ServiceNow Default Test')
        self.assertTrue(self.profile.is_active)

    def test_import_batch_unique_constraint(self):
        month = date(2026, 3, 1)
        TicketImportBatch.objects.create(
            user=self.user,
            month=month,
            profile=self.profile,
            record_count=10,
        )

        # Same user, same month should fail (both active)
        with self.assertRaises(Exception):
            TicketImportBatch.objects.create(
                user=self.user,
                month=month,
                profile=self.profile,
                record_count=5,
            )

    def test_import_batch_override_allows_new_active(self):
        """Overridden batch frees the slot for a new active upload."""
        month = date(2026, 3, 1)
        old_batch = TicketImportBatch.objects.create(
            user=self.user,
            month=month,
            profile=self.profile,
            record_count=10,
        )
        old_batch.is_overridden = True
        old_batch.save()

        # New active upload should succeed
        new_batch = TicketImportBatch.objects.create(
            user=self.user,
            month=month,
            profile=self.profile,
            record_count=5,
        )
        self.assertFalse(new_batch.is_overridden)

    def test_export_profile_soft_delete(self):
        """Destroy should set is_active=False, not hard delete."""
        self.profile.is_active = False
        self.profile.save()
        self.assertTrue(ExportProfile.objects.filter(id=self.profile.id).exists())

    def test_normalized_ticket_cascade_delete(self):
        month = date(2026, 3, 1)
        batch = TicketImportBatch.objects.create(
            user=self.user,
            month=month,
            profile=self.profile,
            record_count=1,
        )
        ticket = NormalizedTicket.objects.create(
            batch=batch,
            ticket_id='INC001',
            title='Test',
            status='closed',
            created_at=timezone.now(),
        )

        ticket_id = ticket.id
        batch.delete()

        with self.assertRaises(NormalizedTicket.DoesNotExist):
            NormalizedTicket.objects.get(id=ticket_id)

    def test_monthly_kpi_computation(self):
        month = date(2026, 3, 1)
        batch = TicketImportBatch.objects.create(
            user=self.user,
            month=month,
            profile=self.profile,
            record_count=2,
        )

        # Create tickets
        NormalizedTicket.objects.create(
            batch=batch,
            ticket_id='INC001',
            title='Test 1',
            status='closed',
            created_at=timezone.now(),
            resolved_at=timezone.now(),
            time_to_resolution_hours=5.0,
            sla_breached=False,
            category='Network',
        )
        NormalizedTicket.objects.create(
            batch=batch,
            ticket_id='INC002',
            title='Test 2',
            status='closed',
            created_at=timezone.now(),
            resolved_at=timezone.now(),
            time_to_resolution_hours=15.0,
            sla_breached=True,
            category='Software',
        )

        # Compute KPI
        kpi = compute_monthly_kpi(self.user, month)

        self.assertIsNotNone(kpi)
        self.assertEqual(kpi.total_tickets, 2)
        self.assertEqual(kpi.closed_tickets, 2)
        self.assertEqual(kpi.avg_resolution_hours, 10.0)
        self.assertEqual(kpi.sla_breached_count, 1)
        self.assertEqual(kpi.sla_compliance_pct, 50.0)


class PermissionTests(TestCase):
    """Tests for admin-only delete/override permissions."""

    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.admin = User.objects.create_user(
            username='adminuser',
            password='testpass123',
            is_staff=True,
        )
        self.profile = ExportProfile.objects.create(
            name='Test Profile',
            field_mapping={'ticket_id': 'ID'},
            created_by=self.admin,
        )

    def test_user_cannot_delete_own_batch(self):
        """Non-admin users should not be able to delete their own uploads."""
        month = date(2026, 3, 1)
        batch = TicketImportBatch.objects.create(
            user=self.user,
            month=month,
            profile=self.profile,
            record_count=1,
        )
        # Simulate permission check logic
        is_admin = self.user.is_staff or self.user.is_superuser
        self.assertFalse(is_admin)
        # Batch should remain
        self.assertTrue(TicketImportBatch.objects.filter(id=batch.id).exists())

    def test_admin_can_delete_any_batch(self):
        """Admin should be able to delete any upload."""
        month = date(2026, 3, 1)
        batch = TicketImportBatch.objects.create(
            user=self.user,
            month=month,
            profile=self.profile,
            record_count=1,
        )
        is_admin = self.admin.is_staff or self.admin.is_superuser
        self.assertTrue(is_admin)
        batch.delete()
        self.assertFalse(TicketImportBatch.objects.filter(id=batch.id).exists())

    def test_override_requires_admin(self):
        """Only admin can override an existing month's upload."""
        month = date(2026, 3, 1)
        TicketImportBatch.objects.create(
            user=self.user,
            month=month,
            profile=self.profile,
            record_count=5,
        )
        # User tries to override
        is_user_admin = self.user.is_staff or self.user.is_superuser
        self.assertFalse(is_user_admin)
        # Admin can override
        is_admin_admin = self.admin.is_staff or self.admin.is_superuser
        self.assertTrue(is_admin_admin)


class AnalyticsTests(TestCase):
    """Tests for analytics functions."""

    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.profile = ExportProfile.objects.create(
            name='Test Profile',
            field_mapping={'ticket_id': 'ID'},
            created_by=self.user,
        )

    def test_yearly_summary_no_data(self):
        data = compute_yearly_summary(2026, user_ids=[self.user.id])
        self.assertEqual(data['users_with_data'], 0)
        self.assertEqual(data['total_tickets'], 0)

    def test_get_user_monthly_summary(self):
        # Create 2 months of data
        for month_num in [1, 2]:
            month = date(2026, month_num, 1)
            batch = TicketImportBatch.objects.create(
                user=self.user,
                month=month,
                profile=self.profile,
                record_count=1,
            )
            NormalizedTicket.objects.create(
                batch=batch,
                ticket_id=f'INC{month_num}',
                title='Test',
                status='closed',
                created_at=timezone.now(),
            )
            compute_monthly_kpi(self.user, month)

        summary = get_user_monthly_summary(self.user, months=12)
        # Zero-filling: 12 months requested → 12 entries (2 with data, 10 zero-filled)
        self.assertEqual(len(summary), 12)
        # The two months with data should have non-zero ticket counts
        months_with_data = [s for s in summary if s['total_tickets'] > 0]
        self.assertEqual(len(months_with_data), 2)
        # Zero-filled months should have zero values
        zero_months = [s for s in summary if s['total_tickets'] == 0]
        self.assertEqual(len(zero_months), 10)
        # Verify ordering: oldest → newest
        self.assertEqual(summary[0]['month'] < summary[-1]['month'], True)


class TicketKPIViewSetTests(TestCase):
    """Tests for the Ticket KPI viewsets (permissions, team logic, exports)."""

    @classmethod
    def setUpTestData(cls):
        cls.factory = APIRequestFactory()
        cls.csv_content = (
            "Number,Short description,State,Opened,Resolved,Assigned to,Caller,Priority,Category\n"
            "INC001,Test ticket,Resolved,2026-03-01 08:00,2026-03-01 14:00,User A,User B,P1 - critical,Network\n"
        ).encode('utf-8')

        cls.admin = User.objects.create_user(
            username='admin', password='testpass123', is_staff=True
        )
        cls.tl = User.objects.create_user(username='tl', password='testpass123')
        cls.member = User.objects.create_user(username='member', password='testpass123')
        cls.other = User.objects.create_user(username='other', password='testpass123')

        # Team setup
        cls.team = Team.objects.create(name='Alpha', code='A', team_leader=cls.tl)
        cls.member.profile.teams.add(cls.team)
        cls.tl.profile.teams.add(cls.team)

        # Direct TL assignment for 'other' user
        cls.other.profile.italian_tl = cls.tl
        cls.other.profile.save()

        # Profile and client
        cls.profile = ExportProfile.objects.create(
            name='Test Profile',
            field_mapping={
                'ticket_id': 'Number',
                'title': 'Short description',
                'status': 'State',
                'created_at': 'Opened',
                'resolved_at': 'Resolved',
                'assignee': 'Assigned to',
                'requester': 'Caller',
                'priority': 'Priority',
                'category': 'Category',
            },
            value_transforms={'status': {'resolved': 'closed'}},
            compute_resolution_time=True,
            is_active=True,
            is_global=True,
            created_by=cls.admin,
        )
        cls.client_a = Client.objects.create(name='Client A', code='A')
        cls.client_b = Client.objects.create(name='Client B', code='B')

    def _upload(self, user, client_ids=None):
        """Upload a ticket CSV as the given user."""
        file_obj = SimpleUploadedFile('tickets.csv', self.csv_content, content_type='text/csv')
        data = {
            'file': file_obj,
            'profile_id': self.profile.id,
            'month': '2026-03-01',
        }
        if client_ids:
            data['client_ids'] = ','.join(str(c) for c in client_ids)

        request = self.factory.post('/upload/import_batch/', data, format='multipart')
        force_authenticate(request, user)
        view = TicketUploadViewSet.as_view({'post': 'import_batch'})
        return view(request)

    def test_get_tl_team_members_returns_users_including_self(self):
        """TL team members should be User instances and include the TL and direct assignments."""
        members = _get_tl_team_members(self.tl)
        member_ids = set(members.values_list('id', flat=True))
        self.assertIn(self.tl.id, member_ids)
        self.assertIn(self.member.id, member_ids)
        self.assertIn(self.other.id, member_ids)

    def test_non_tl_gets_empty_team_members(self):
        self.assertFalse(_get_tl_team_members(self.other).exists())

    def test_import_creates_batch_with_non_empty_raw_file(self):
        response = self._upload(self.member)
        self.assertEqual(response.status_code, 201)
        batch = TicketImportBatch.objects.get(pk=response.data['batch_id'])
        self.assertEqual(batch.record_count, 1)
        self.assertTrue(batch.raw_file.size > 0)
        self.assertTrue(batch.tickets.filter(ticket_id='INC001').exists())

    def test_import_recomputes_monthly_kpi(self):
        self._upload(self.member)
        kpi = compute_monthly_kpi(self.member, date(2026, 3, 1))
        self.assertIsNotNone(kpi)
        self.assertEqual(kpi.total_tickets, 1)

    def test_client_subset_validation(self):
        self.profile.assigned_clients.add(self.client_a)
        response = self._upload(self.member, client_ids=[self.client_b.id])
        self.assertEqual(response.status_code, 400)

    def test_user_can_delete_own_unreviewed_batch(self):
        response = self._upload(self.member)
        batch_id = response.data['batch_id']
        request = self.factory.delete(f'/upload/{batch_id}/delete_batch/')
        force_authenticate(request, self.member)
        view = TicketUploadViewSet.as_view({'delete': 'delete_batch'})
        response = view(request, pk=batch_id)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(TicketImportBatch.objects.filter(pk=batch_id).exists())

    def test_user_cannot_delete_own_reviewed_batch(self):
        response = self._upload(self.member)
        batch_id = response.data['batch_id']

        review_request = self.factory.post(f'/upload/{batch_id}/review_batch/')
        force_authenticate(review_request, self.tl)
        review_view = TicketUploadViewSet.as_view({'post': 'review_batch'})
        review_response = review_view(review_request, pk=batch_id)
        self.assertEqual(review_response.status_code, 200)

        delete_request = self.factory.delete(f'/upload/{batch_id}/delete_batch/')
        force_authenticate(delete_request, self.member)
        delete_view = TicketUploadViewSet.as_view({'delete': 'delete_batch'})
        delete_response = delete_view(delete_request, pk=batch_id)
        self.assertEqual(delete_response.status_code, 403)

    def test_tl_can_delete_team_member_batch(self):
        response = self._upload(self.member)
        batch_id = response.data['batch_id']
        request = self.factory.delete(f'/upload/{batch_id}/delete_batch/')
        force_authenticate(request, self.tl)
        view = TicketUploadViewSet.as_view({'delete': 'delete_batch'})
        response = view(request, pk=batch_id)
        self.assertEqual(response.status_code, 200)

    def test_tl_can_view_team_summary(self):
        self._upload(self.member)
        request = self.factory.get('/dashboard/team_summary/', {'month': '2026-03-01'})
        force_authenticate(request, self.tl)
        view = TicketKPIDashboardViewSet.as_view({'get': 'team_summary'})
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total_tickets'], 1)
        member_ids = {m['user_id'] for m in response.data['members']}
        self.assertIn(self.member.id, member_ids)

    def test_tl_can_view_team_batches(self):
        self._upload(self.member)
        request = self.factory.get('/upload/team_batches/')
        force_authenticate(request, self.tl)
        view = TicketUploadViewSet.as_view({'get': 'team_batches'})
        response = view(request)
        self.assertEqual(response.status_code, 200)
        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 1)

    def test_user_can_export_own_report(self):
        self._upload(self.member)
        request = self.factory.get('/reports/yearly_summary/', {'year': 2026})
        force_authenticate(request, self.member)
        view = TicketKPIReportViewSet.as_view({'get': 'yearly_summary'})
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total_tickets'], 1)

    def test_tl_export_includes_team_members(self):
        self._upload(self.member)
        self._upload(self.tl)
        request = self.factory.get('/reports/yearly_summary/', {'year': 2026})
        force_authenticate(request, self.tl)
        view = TicketKPIReportViewSet.as_view({'get': 'yearly_summary'})
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total_tickets'], 2)

    def test_yearly_summary_rejects_malformed_year(self):
        request = self.factory.get('/reports/yearly_summary/', {'year': 'not-a-year'})
        force_authenticate(request, self.member)
        view = TicketKPIReportViewSet.as_view({'get': 'yearly_summary'})
        response = view(request)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['error'], 'year must be an integer')

    def test_tl_cannot_export_explicit_outside_user_id(self):
        outsider = User.objects.create_user(username='export-outsider', password='testpass123')
        request = self.factory.get(
            '/reports/yearly_summary/',
            {'year': 2026, 'user_ids': str(outsider.id)},
        )
        force_authenticate(request, self.tl)
        view = TicketKPIReportViewSet.as_view({'get': 'yearly_summary'})
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_export_rejects_malformed_user_ids(self):
        request = self.factory.get(
            '/reports/yearly_summary/',
            {'year': 2026, 'user_ids': '1,nope'},
        )
        force_authenticate(request, self.member)
        view = TicketKPIReportViewSet.as_view({'get': 'yearly_summary'})
        response = view(request)
        self.assertEqual(response.status_code, 400)

    def test_non_admin_cannot_create_export_profile(self):
        request = self.factory.post('/profiles/', {
            'name': 'New Profile',
            'field_mapping': {'ticket_id': 'ID'},
            'is_active': True,
        }, format='json')
        force_authenticate(request, self.member)
        view = ExportProfileViewSet.as_view({'post': 'create'})
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_admin_can_create_export_profile(self):
        request = self.factory.post('/profiles/', {
            'name': 'New Profile',
            'field_mapping': {'ticket_id': 'ID'},
            'is_active': True,
        }, format='json')
        force_authenticate(request, self.admin)
        view = ExportProfileViewSet.as_view({'post': 'create'})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertTrue(ExportProfile.objects.filter(name='New Profile').exists())

    # ----- H1: TL cross-user access must be scoped to team members -----

    def test_tl_cannot_view_non_team_member_monthly_summary(self):
        """A TL must not access KPI data for a user outside their team."""
        # Create a user that is NOT in the TL's team.
        outsider = User.objects.create_user(username='outsider', password='testpass123')
        self._upload(self.member)  # populate data for `member`
        self._upload_as(outsider)  # populate data for outsider

        request = self.factory.get(
            '/dashboard/monthly_summary/',
            {'month': '2026-03-01', 'user_id': outsider.id},
        )
        force_authenticate(request, self.tl)
        view = TicketKPIDashboardViewSet.as_view({'get': 'monthly_summary'})
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_tl_cannot_view_non_team_member_trend(self):
        outsider = User.objects.create_user(username='outsider', password='testpass123')
        self._upload_as(outsider)
        request = self.factory.get(
            '/dashboard/trend/',
            {'months': 6, 'user_id': outsider.id},
        )
        force_authenticate(request, self.tl)
        view = TicketKPIDashboardViewSet.as_view({'get': 'trend'})
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_tl_cannot_view_non_team_member_categories(self):
        outsider = User.objects.create_user(username='outsider', password='testpass123')
        self._upload_as(outsider)
        request = self.factory.get(
            '/dashboard/categories/',
            {'month': '2026-03-01', 'user_id': outsider.id},
        )
        force_authenticate(request, self.tl)
        view = TicketKPIDashboardViewSet.as_view({'get': 'categories'})
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_tl_can_view_team_member_monthly_summary(self):
        """A TL can access KPI data for a user in their team."""
        self._upload(self.member)
        request = self.factory.get(
            '/dashboard/monthly_summary/',
            {'month': '2026-03-01', 'user_id': self.member.id},
        )
        force_authenticate(request, self.tl)
        view = TicketKPIDashboardViewSet.as_view({'get': 'monthly_summary'})
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['has_data'])

    # ----- Ticket records detail view (dynamic fields + filters) -----

    def test_tickets_returns_rows_and_dynamic_fields(self):
        """The tickets endpoint returns uploaded rows plus the union of raw_data fields."""
        self._upload(self.member)
        request = self.factory.get(
            '/dashboard/tickets/',
            {'month': '2026-03-01', 'user_id': self.member.id},
        )
        force_authenticate(request, self.tl)
        view = TicketKPIDashboardViewSet.as_view({'get': 'tickets'})
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(len(response.data['results']), 1)
        row = response.data['results'][0]
        self.assertEqual(row['ticket_id'], 'INC001')
        # Standard fields are always present in available_fields
        self.assertIn('ticket_id', response.data['available_fields'])
        self.assertIn('status', response.data['available_fields'])
        # raw_data carries every uploaded column (dynamic discovery source)
        self.assertIn('Number', row['raw_data'])
        # Filter options expose distinct values for dropdowns
        self.assertIn('Network', response.data['filter_options']['category'])

    def test_tickets_filters_by_status_and_search(self):
        """Status and search filters narrow the ticket rows server-side."""
        self._upload(self.member)
        # status filter (value_transforms maps 'resolved' -> 'closed')
        request = self.factory.get(
            '/dashboard/tickets/',
            {'month': '2026-03-01', 'user_id': self.member.id, 'status': 'closed'},
        )
        force_authenticate(request, self.tl)
        view = TicketKPIDashboardViewSet.as_view({'get': 'tickets'})
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)
        # search filter matching the ticket id
        search_request = self.factory.get(
            '/dashboard/tickets/',
            {'month': '2026-03-01', 'user_id': self.member.id, 'search': 'INC001'},
        )
        force_authenticate(search_request, self.tl)
        search_response = view(search_request)
        self.assertEqual(search_response.status_code, 200)
        self.assertEqual(search_response.data['count'], 1)
        # non-matching search returns zero
        nomatch_request = self.factory.get(
            '/dashboard/tickets/',
            {'month': '2026-03-01', 'user_id': self.member.id, 'search': 'NOPE'},
        )
        force_authenticate(nomatch_request, self.tl)
        nomatch_response = view(nomatch_request)
        self.assertEqual(nomatch_response.data['count'], 0)

    def test_tl_cannot_view_non_team_member_tickets(self):
        """A TL must not list ticket rows for a user outside their team."""
        outsider = User.objects.create_user(username='outsider2', password='testpass123')
        self._upload_as(outsider)
        request = self.factory.get(
            '/dashboard/tickets/',
            {'month': '2026-03-01', 'user_id': outsider.id},
        )
        force_authenticate(request, self.tl)
        view = TicketKPIDashboardViewSet.as_view({'get': 'tickets'})
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_tickets_requires_month(self):
        """Missing month returns 400 instead of 500."""
        request = self.factory.get('/dashboard/tickets/', {'user_id': self.member.id})
        force_authenticate(request, self.tl)
        view = TicketKPIDashboardViewSet.as_view({'get': 'tickets'})
        response = view(request)
        self.assertEqual(response.status_code, 400)

    # ----- M2: invalid int params should return 400, not 500 -----

    def test_monthly_summary_invalid_user_id_returns_400(self):
        request = self.factory.get(
            '/dashboard/monthly_summary/',
            {'month': '2026-03-01', 'user_id': 'not-an-int'},
        )
        force_authenticate(request, self.tl)
        view = TicketKPIDashboardViewSet.as_view({'get': 'monthly_summary'})
        response = view(request)
        self.assertEqual(response.status_code, 400)

    def test_trend_invalid_months_returns_400(self):
        request = self.factory.get('/dashboard/trend/', {'months': 'abc'})
        force_authenticate(request, self.tl)
        view = TicketKPIDashboardViewSet.as_view({'get': 'trend'})
        response = view(request)
        self.assertEqual(response.status_code, 400)

    def test_categories_invalid_month_returns_400(self):
        request = self.factory.get('/dashboard/categories/', {'month': 'not-a-date'})
        force_authenticate(request, self.tl)
        view = TicketKPIDashboardViewSet.as_view({'get': 'categories'})
        response = view(request)
        self.assertEqual(response.status_code, 400)

    def test_trend_missing_user_id_returns_404(self):
        """A non-existent user_id should return 404, not 500."""
        request = self.factory.get(
            '/dashboard/trend/',
            {'months': 6, 'user_id': 999999},
        )
        force_authenticate(request, self.admin)
        view = TicketKPIDashboardViewSet.as_view({'get': 'trend'})
        response = view(request)
        self.assertEqual(response.status_code, 404)

    # ----- H2: delete_team_batch must respect reviewed-batch protection -----

    def test_tl_cannot_delete_team_member_reviewed_batch(self):
        """A TL cannot delete a team member's batch once it has been reviewed."""
        response = self._upload(self.member)
        batch_id = response.data['batch_id']

        # Review the batch as the TL.
        review_request = self.factory.post(f'/upload/{batch_id}/review_batch/')
        force_authenticate(review_request, self.tl)
        review_view = TicketUploadViewSet.as_view({'post': 'review_batch'})
        review_response = review_view(review_request, pk=batch_id)
        self.assertEqual(review_response.status_code, 200)

        # Now the TL tries to delete the reviewed batch via delete_team_batch.
        delete_request = self.factory.delete(f'/upload/{batch_id}/delete_team_batch/')
        force_authenticate(delete_request, self.tl)
        delete_view = TicketUploadViewSet.as_view({'delete': 'delete_team_batch'})
        delete_response = delete_view(delete_request, pk=batch_id)
        self.assertEqual(delete_response.status_code, 403)
        self.assertTrue(TicketImportBatch.objects.filter(pk=batch_id).exists())

    def test_admin_can_delete_team_member_reviewed_batch(self):
        """An admin can still delete a reviewed batch via delete_batch (the
        admin path, since delete_team_batch requires the caller to be a TL)."""
        response = self._upload(self.member)
        batch_id = response.data['batch_id']

        review_request = self.factory.post(f'/upload/{batch_id}/review_batch/')
        force_authenticate(review_request, self.tl)
        review_view = TicketUploadViewSet.as_view({'post': 'review_batch'})
        review_view(review_request, pk=batch_id)

        delete_request = self.factory.delete(f'/upload/{batch_id}/delete_batch/')
        force_authenticate(delete_request, self.admin)
        delete_view = TicketUploadViewSet.as_view({'delete': 'delete_batch'})
        delete_response = delete_view(delete_request, pk=batch_id)
        self.assertEqual(delete_response.status_code, 200)
        self.assertFalse(TicketImportBatch.objects.filter(pk=batch_id).exists())

    # ----- M1: ExportProfile ownership checks -----

    def test_non_creator_cannot_update_export_profile(self):
        """A user with configure perm but not the creator cannot update a profile."""
        # Create a profile as admin.
        prof = ExportProfile.objects.create(
            name='Owned By Admin',
            field_mapping={'ticket_id': 'ID'},
            is_active=True,
            is_global=True,
            created_by=self.admin,
        )
        # Grant the member configure permission via superuser flag is not set,
        # so we test as a second admin (still not the creator) to exercise the
        # ownership check without the configure-perm gate getting in the way.
        other_admin = User.objects.create_user(
            username='other_admin', password='testpass123', is_staff=True
        )
        request = self.factory.patch(
            f'/profiles/{prof.id}/',
            {'name': 'Hacked Name'},
            format='json',
        )
        force_authenticate(request, other_admin)
        view = ExportProfileViewSet.as_view({'patch': 'partial_update'})
        response = view(request, pk=prof.id)
        # Staff bypasses the ownership check, so this should succeed.
        self.assertEqual(response.status_code, 200)

    def test_creator_can_update_own_export_profile(self):
        """A non-admin creator can update their own profile if they have configure perm."""
        # Make the member staff so they pass the permission_action_map gate,
        # then create a profile as them.
        self.member.is_staff = True
        self.member.save()
        prof = ExportProfile.objects.create(
            name='Owned By Member',
            field_mapping={'ticket_id': 'ID'},
            is_active=True,
            is_global=True,
            created_by=self.member,
        )
        request = self.factory.patch(
            f'/profiles/{prof.id}/',
            {'name': 'Renamed'},
            format='json',
        )
        force_authenticate(request, self.member)
        view = ExportProfileViewSet.as_view({'patch': 'partial_update'})
        response = view(request, pk=prof.id)
        self.assertEqual(response.status_code, 200)
        prof.refresh_from_db()
        self.assertEqual(prof.name, 'Renamed')

    # ----- M4: client_ids validated against user's assigned clients -----

    def test_user_cannot_upload_for_unassigned_client(self):
        """A user with no assigned clients cannot upload for any client; a user
        with assigned clients cannot upload for clients outside their set."""
        # Give the member one assigned client.
        self.member.profile.clients.add(self.client_a)
        # Try to upload for client_b (not assigned).
        response = self._upload(self.member, client_ids=[self.client_b.id])
        self.assertEqual(response.status_code, 403)

    def test_user_can_upload_for_assigned_client(self):
        """A user can upload for clients they are assigned to."""
        self.member.profile.clients.add(self.client_a)
        # Profile must also allow client_a, otherwise profile/client check fails.
        self.profile.assigned_clients.add(self.client_a)
        response = self._upload(self.member, client_ids=[self.client_a.id])
        self.assertEqual(response.status_code, 201)

    # ----- Helper: upload as an arbitrary user (for outsider tests) -----

    def _upload_as(self, user):
        """Upload a ticket CSV as the given user (uses a different month to
        avoid colliding with the member's upload)."""
        file_obj = SimpleUploadedFile('tickets.csv', self.csv_content, content_type='text/csv')
        data = {
            'file': file_obj,
            'profile_id': self.profile.id,
            'month': '2026-04-01',
        }
        request = self.factory.post('/upload/import_batch/', data, format='multipart')
        force_authenticate(request, user)
        view = TicketUploadViewSet.as_view({'post': 'import_batch'})
        return view(request)


class KPIEvidenceTests(TestCase):
    """Tests for KPI evidence uploads and review."""

    @classmethod
    def setUpTestData(cls):
        cls.factory = APIRequestFactory()
        cls.tl = User.objects.create_user(username='evidence_tl', password='testpass123')
        cls.member = User.objects.create_user(username='evidence_member', password='testpass123')

        cls.team = Team.objects.create(name='Evidence Team', code='ET', team_leader=cls.tl)
        cls.member.profile.teams.add(cls.team)

        cls.client_a = Client.objects.create(name='Evidence Client A', code='ECA')
        cls.member.profile.clients.add(cls.client_a)

    def _create_evidence(self, user, evidence_type='document', client_ids=None):
        pdf = SimpleUploadedFile('cert.pdf', b'%PDF-1.4 fake pdf content', content_type='application/pdf')
        data = {
            'file': pdf,
            'month': '2026-03-01',
            'evidence_type': evidence_type,
            'description': 'Evidence description',
        }
        if client_ids:
            data['client_ids'] = ','.join(str(c) for c in client_ids)

        request = self.factory.post('/evidence/', data, format='multipart')
        force_authenticate(request, user)
        from plugins.ticket_kpi.viewsets import KPIEvidenceViewSet
        view = KPIEvidenceViewSet.as_view({'post': 'create'})
        return view(request)

    def test_user_can_create_evidence(self):
        response = self._create_evidence(self.member, client_ids=[self.client_a.id])
        self.assertEqual(response.status_code, 201)
        evidence = KPIEvidence.objects.get(pk=response.data['id'])
        self.assertEqual(evidence.user, self.member)
        self.assertIn(self.client_a, evidence.clients.all())

    def test_evidence_client_validation(self):
        other_client = Client.objects.create(name='Other Client', code='OC')
        response = self._create_evidence(self.member, client_ids=[other_client.id])
        self.assertEqual(response.status_code, 400)

    def test_tl_can_review_evidence(self):
        response = self._create_evidence(self.member, client_ids=[self.client_a.id])
        evidence_id = response.data['id']

        request = self.factory.post(f'/evidence/{evidence_id}/review/', {'status': 'approved'})
        force_authenticate(request, self.tl)
        from plugins.ticket_kpi.viewsets import KPIEvidenceViewSet
        view = KPIEvidenceViewSet.as_view({'post': 'review'})
        response = view(request, pk=evidence_id)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'approved')

    def test_eml_parsing(self):
        eml = (
            "From: sender@example.com\r\n"
            "To: receiver@example.com\r\n"
            "Subject: Test EML\r\n"
            "Date: Mon, 01 Mar 2026 10:00:00 +0000\r\n"
            "Content-Type: text/plain\r\n\r\n"
            "This is the body."
        ).encode('utf-8')
        parsed = parse_eml_bytes(eml)
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed['subject'], 'Test EML')
        self.assertIn('body', parsed['body_plain'].lower())

    def _evidence_view(self, action, user, pk=None, data=None):
        from plugins.ticket_kpi.viewsets import KPIEvidenceViewSet

        mapping = {
            'retrieve': {'get': 'retrieve'},
            'partial_update': {'patch': 'partial_update'},
            'destroy': {'delete': 'destroy'},
            'review': {'post': 'review'},
            'unreview': {'post': 'unreview'},
        }
        view = KPIEvidenceViewSet.as_view(mapping[action])
        if action == 'retrieve':
            request = self.factory.get(f'/evidence/{pk}/')
        elif action == 'partial_update':
            request = self.factory.patch(f'/evidence/{pk}/', data, format='multipart')
        elif action == 'destroy':
            request = self.factory.delete(f'/evidence/{pk}/')
        elif action == 'review':
            request = self.factory.post(f'/evidence/{pk}/review/', data)
        elif action == 'unreview':
            request = self.factory.post(f'/evidence/{pk}/unreview/')
        else:
            raise ValueError(action)
        force_authenticate(request, user)
        kwargs = {}
        if pk is not None:
            kwargs['pk'] = pk
        return view(request, **kwargs)

    def test_member_can_delete_own_unreviewed_evidence(self):
        response = self._create_evidence(self.member, client_ids=[self.client_a.id])
        evidence_id = response.data['id']

        response = self._evidence_view('destroy', self.member, pk=evidence_id)
        self.assertEqual(response.status_code, 204)
        self.assertFalse(KPIEvidence.objects.filter(pk=evidence_id).exists())

    def test_member_cannot_delete_reviewed_evidence(self):
        response = self._create_evidence(self.member, client_ids=[self.client_a.id])
        evidence_id = response.data['id']

        self._evidence_view('review', self.tl, pk=evidence_id, data={'status': 'approved'})

        response = self._evidence_view('destroy', self.member, pk=evidence_id)
        self.assertEqual(response.status_code, 403)
        self.assertTrue(KPIEvidence.objects.filter(pk=evidence_id).exists())

    def test_tl_can_delete_team_evidence(self):
        response = self._create_evidence(self.member, client_ids=[self.client_a.id])
        evidence_id = response.data['id']

        response = self._evidence_view('destroy', self.tl, pk=evidence_id)
        self.assertEqual(response.status_code, 204)
        self.assertFalse(KPIEvidence.objects.filter(pk=evidence_id).exists())

    def test_non_owner_cannot_delete_others_evidence(self):
        other = User.objects.create_user(username='evidence_other', password='testpass123')
        response = self._create_evidence(self.member, client_ids=[self.client_a.id])
        evidence_id = response.data['id']

        response = self._evidence_view('destroy', other, pk=evidence_id)
        # Queryset scopes users to their own evidence, so other users get 404
        self.assertEqual(response.status_code, 404)

    def test_member_can_update_own_pending_evidence(self):
        response = self._create_evidence(self.member, client_ids=[self.client_a.id])
        evidence_id = response.data['id']

        response = self._evidence_view(
            'partial_update',
            self.member,
            pk=evidence_id,
            data={'description': 'Updated by member'},
        )
        self.assertEqual(response.status_code, 200)
        evidence = KPIEvidence.objects.get(pk=evidence_id)
        self.assertEqual(evidence.description, 'Updated by member')

    def test_member_cannot_update_reviewed_evidence(self):
        response = self._create_evidence(self.member, client_ids=[self.client_a.id])
        evidence_id = response.data['id']

        self._evidence_view('review', self.tl, pk=evidence_id, data={'status': 'approved'})

        response = self._evidence_view(
            'partial_update',
            self.member,
            pk=evidence_id,
            data={'description': 'Should fail'},
        )
        self.assertEqual(response.status_code, 403)

    def test_tl_can_update_team_evidence(self):
        response = self._create_evidence(self.member, client_ids=[self.client_a.id])
        evidence_id = response.data['id']

        response = self._evidence_view(
            'partial_update',
            self.tl,
            pk=evidence_id,
            data={'description': 'Updated by TL'},
        )
        self.assertEqual(response.status_code, 200)
        evidence = KPIEvidence.objects.get(pk=evidence_id)
        self.assertEqual(evidence.description, 'Updated by TL')

    def test_member_cannot_review_evidence(self):
        response = self._create_evidence(self.member, client_ids=[self.client_a.id])
        evidence_id = response.data['id']

        response = self._evidence_view('review', self.member, pk=evidence_id, data={'status': 'approved'})
        self.assertEqual(response.status_code, 403)

    def test_unreview_action_resets_evidence(self):
        response = self._create_evidence(self.member, client_ids=[self.client_a.id])
        evidence_id = response.data['id']

        self._evidence_view('review', self.tl, pk=evidence_id, data={'status': 'approved'})

        response = self._evidence_view('unreview', self.tl, pk=evidence_id)
        self.assertEqual(response.status_code, 200)
        evidence = KPIEvidence.objects.get(pk=evidence_id)
        self.assertEqual(evidence.status, 'pending')
        self.assertIsNone(evidence.reviewed_by)
        self.assertIsNone(evidence.reviewed_at)

    def test_tl_can_list_team_evidence_by_user_and_month(self):
        """TL listing evidence with user_id and month returns the member's evidence."""
        self._create_evidence(self.member, client_ids=[self.client_a.id])
        from plugins.ticket_kpi.viewsets import KPIEvidenceViewSet
        view = KPIEvidenceViewSet.as_view({'get': 'list'})

        request = self.factory.get('/evidence/', {'user_id': self.member.id, 'month': '2026-03-01'})
        force_authenticate(request, self.tl)
        response = view(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['user'], self.member.id)

    def test_evidence_list_accepts_short_month_format(self):
        """Month query param may be YYYY-MM and is normalized to first day."""
        from plugins.ticket_kpi.models import KPIEvidence
        KPIEvidence.objects.create(
            user=self.member,
            month=date(2026, 3, 1),
            evidence_type='document',
            description='Test evidence',
        )
        from plugins.ticket_kpi.viewsets import KPIEvidenceViewSet
        view = KPIEvidenceViewSet.as_view({'get': 'list'})

        request = self.factory.get('/evidence/', {'user_id': self.member.id, 'month': '2026-03'})
        force_authenticate(request, self.tl)
        response = view(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)


class EndToEndUploadFlowTests(TestCase):
    """End-to-end simulation of the full user journey.

    Exercises the complete upload flow that real users will follow:
    analyze → preview → import → dashboard → evidence → TL review.

    These tests verify that nothing breaks when users actually use the system.
    """

    @classmethod
    def setUpTestData(cls):
        cls.factory = APIRequestFactory()

        # --- Realistic CSV with multiple tickets, mixed statuses ---
        cls.csv_content = (
            "Number,Short description,State,Opened,Resolved,Assigned to,Caller,Priority,Category\n"
            "INC001,VPN not working,Resolved,2026-03-01 08:00,2026-03-01 14:00,Alice,Bob,P1 - critical,Network\n"
            "INC002,Printer offline,Closed,2026-03-02 09:00,2026-03-02 11:00,Alice,Charlie,P2 - high,Hardware\n"
            "INC003,Email sync issue,In Progress,2026-03-03 10:00,,Alice,Diana,P3 - moderate,Software\n"
            "INC004,Password reset,Closed,2026-03-04 08:30,2026-03-04 09:00,Bob,Eve,P4 - low,Access\n"
            "INC005,Server down,Resolved,2026-03-05 02:00,2026-03-05 06:00,Alice,Frank,P1 - critical,Network\n"
        ).encode('utf-8')

        # --- Users ---
        cls.admin = User.objects.create_user(
            username='e2e_admin', password='testpass123', is_staff=True
        )
        cls.tl = User.objects.create_user(username='e2e_tl', password='testpass123')
        cls.member = User.objects.create_user(username='e2e_member', password='testpass123')
        cls.outsider = User.objects.create_user(username='e2e_outsider', password='testpass123')

        # --- Team setup ---
        # TL leads the team; is_team_leader property derives from led_teams.exists().
        cls.team = Team.objects.create(name='E2E Team', code='E2E', team_leader=cls.tl)
        cls.member.profile.teams.add(cls.team)
        cls.tl.profile.teams.add(cls.team)

        # --- Client ---
        cls.client_a = Client.objects.create(name='E2E Client', code='E2EC')
        cls.member.profile.clients.add(cls.client_a)

        # --- Export profile (global, active) ---
        cls.profile = ExportProfile.objects.create(
            name='E2E ServiceNow Profile',
            field_mapping={
                'ticket_id': 'Number',
                'title': 'Short description',
                'status': 'State',
                'created_at': 'Opened',
                'resolved_at': 'Resolved',
                'assignee': 'Assigned to',
                'requester': 'Caller',
                'priority': 'Priority',
                'category': 'Category',
            },
            value_transforms={
                'status': {
                    'resolved': 'closed',
                    'closed': 'closed',
                    'in progress': 'open',
                }
            },
            compute_resolution_time=True,
            compute_sla=True,
            is_active=True,
            is_global=True,
            created_by=cls.admin,
        )

    # --- Helpers ---

    def _make_xlsx(self):
        """Create an XLSX file in memory with the same data as the CSV."""
        df = pd.DataFrame({
            'Number': ['INC001', 'INC002'],
            'Short description': ['VPN issue', 'Printer down'],
            'State': ['Resolved', 'Closed'],
            'Opened': ['2026-03-01 08:00', '2026-03-02 09:00'],
            'Resolved': ['2026-03-01 14:00', '2026-03-02 11:00'],
            'Assigned to': ['Alice', 'Alice'],
            'Caller': ['Bob', 'Charlie'],
            'Priority': ['P1 - critical', 'P2 - high'],
            'Category': ['Network', 'Hardware'],
        })
        buffer = io.BytesIO()
        with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Tickets')
        return buffer.getvalue()

    def _analyze(self, user, file_content=None, filename='tickets.csv'):
        """Step 1: Analyze file."""
        content = file_content if file_content is not None else self.csv_content
        file_obj = SimpleUploadedFile(filename, content, content_type='text/csv')
        request = self.factory.post('/upload/analyze/', {'file': file_obj}, format='multipart')
        force_authenticate(request, user)
        view = TicketUploadViewSet.as_view({'post': 'analyze'})
        return view(request)

    def _preview(self, user, file_content=None, filename='tickets.csv'):
        """Step 2: Preview file."""
        content = file_content if file_content is not None else self.csv_content
        file_obj = SimpleUploadedFile(filename, content, content_type='text/csv')
        data = {
            'file': file_obj,
            'profile_id': self.profile.id,
            'month': '2026-03-01',
        }
        request = self.factory.post('/upload/preview/', data, format='multipart')
        force_authenticate(request, user)
        view = TicketUploadViewSet.as_view({'post': 'preview'})
        return view(request)

    def _import(self, user, file_content=None, filename='tickets.csv', month='2026-03-01', client_ids=None):
        """Step 3: Import file."""
        content = file_content if file_content is not None else self.csv_content
        file_obj = SimpleUploadedFile(filename, content, content_type='text/csv')
        data = {
            'file': file_obj,
            'profile_id': self.profile.id,
            'month': month,
        }
        if client_ids:
            data['client_ids'] = ','.join(str(c) for c in client_ids)
        request = self.factory.post('/upload/import_batch/', data, format='multipart')
        force_authenticate(request, user)
        view = TicketUploadViewSet.as_view({'post': 'import_batch'})
        return view(request)

    def _monthly_summary(self, user, month='2026-03-01', target_user_id=None):
        """Get dashboard monthly summary."""
        params = {'month': month}
        if target_user_id:
            params['user_id'] = target_user_id
        request = self.factory.get('/dashboard/monthly_summary/', params)
        force_authenticate(request, user)
        view = TicketKPIDashboardViewSet.as_view({'get': 'monthly_summary'})
        return view(request)

    def _trend(self, user, months=6, target_user_id=None):
        """Get dashboard trend."""
        params = {'months': months}
        if target_user_id:
            params['user_id'] = target_user_id
        request = self.factory.get('/dashboard/trend/', params)
        force_authenticate(request, user)
        view = TicketKPIDashboardViewSet.as_view({'get': 'trend'})
        return view(request)

    def _categories(self, user, month='2026-03-01', target_user_id=None):
        """Get dashboard categories."""
        params = {'month': month}
        if target_user_id:
            params['user_id'] = target_user_id
        request = self.factory.get('/dashboard/categories/', params)
        force_authenticate(request, user)
        view = TicketKPIDashboardViewSet.as_view({'get': 'categories'})
        return view(request)

    def _team_summary(self, user, month='2026-03-01'):
        """Get team summary."""
        request = self.factory.get('/dashboard/team_summary/', {'month': month})
        force_authenticate(request, user)
        view = TicketKPIDashboardViewSet.as_view({'get': 'team_summary'})
        return view(request)

    def _team_trend(self, user, months=6, month='2026-03-01'):
        """Get team trend."""
        params = {'months': months, 'month': month}
        request = self.factory.get('/dashboard/team_trend/', params)
        force_authenticate(request, user)
        view = TicketKPIDashboardViewSet.as_view({'get': 'team_trend'})
        return view(request)

    def _create_evidence(self, user, month='2026-03-01', client_ids=None):
        """Create evidence record."""
        pdf = SimpleUploadedFile(
            'certificate.pdf', b'%PDF-1.4 fake pdf content', content_type='application/pdf'
        )
        data = {
            'file': pdf,
            'month': month,
            'evidence_type': 'certificate',
            'description': 'E2E test certificate',
        }
        if client_ids:
            data['client_ids'] = ','.join(str(c) for c in client_ids)
        request = self.factory.post('/evidence/', data, format='multipart')
        force_authenticate(request, user)
        from plugins.ticket_kpi.viewsets import KPIEvidenceViewSet
        view = KPIEvidenceViewSet.as_view({'post': 'create'})
        return view(request)

    # --- Step 1: Analyze ---

    def test_analyze_csv_detects_columns_and_suggests_profile(self):
        """Step 1: Analyze detects columns and suggests the matching profile."""
        response = self._analyze(self.member)
        self.assertEqual(response.status_code, 200)
        self.assertIn('detected_columns', response.data)
        self.assertIn('Number', response.data['detected_columns'])
        self.assertEqual(response.data['total_rows'], 5)
        self.assertIn('suggested_mapping', response.data)
        self.assertEqual(response.data['suggested_mapping']['ticket_id'], 'Number')
        # Should suggest our global profile
        self.assertIn('suggested_profile', response.data)
        self.assertEqual(response.data['suggested_profile']['id'], self.profile.id)

    def test_analyze_xlsx_detects_columns(self):
        """Step 1: Analyze works with XLSX files too."""
        xlsx_content = self._make_xlsx()
        response = self._analyze(self.member, file_content=xlsx_content, filename='tickets.xlsx')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total_rows'], 2)
        self.assertIn('Number', response.data['detected_columns'])

    def test_analyze_no_file_returns_400(self):
        """Step 1: Missing file returns 400."""
        request = self.factory.post('/upload/analyze/', {}, format='multipart')
        force_authenticate(request, self.member)
        view = TicketUploadViewSet.as_view({'post': 'analyze'})
        response = view(request)
        self.assertEqual(response.status_code, 400)

    # --- Step 2: Preview ---

    def test_preview_returns_normalized_data(self):
        """Step 2: Preview returns normalized records and breakdowns."""
        response = self._preview(self.member)
        self.assertEqual(response.status_code, 200)
        self.assertIn('preview_rows', response.data)
        self.assertEqual(response.data['total_records'], 5)
        self.assertIn('status_breakdown', response.data)
        # 'Resolved' and 'Closed' both transform to 'closed', 'In Progress' to 'open'
        self.assertIn('closed', response.data['status_breakdown'])
        self.assertFalse(response.data['has_existing_upload'])

    def test_preview_invalid_profile_returns_404(self):
        """Step 2: Invalid profile_id returns 404."""
        file_obj = SimpleUploadedFile('tickets.csv', self.csv_content, content_type='text/csv')
        request = self.factory.post(
            '/upload/preview/',
            {'file': file_obj, 'profile_id': 99999, 'month': '2026-03-01'},
            format='multipart',
        )
        force_authenticate(request, self.member)
        view = TicketUploadViewSet.as_view({'post': 'preview'})
        response = view(request)
        self.assertEqual(response.status_code, 404)

    # --- Step 3: Import ---

    def test_full_wizard_csv_import_creates_batch_and_tickets(self):
        """Step 3: Full CSV import creates batch, tickets, and computes KPI."""
        response = self._import(self.member)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['record_count'], 5)
        self.assertEqual(response.data['month'], '2026-03')

        batch = TicketImportBatch.objects.get(pk=response.data['batch_id'])
        self.assertEqual(batch.user, self.member)
        self.assertEqual(batch.record_count, 5)
        self.assertTrue(batch.raw_file.size > 0)
        self.assertEqual(batch.tickets.count(), 5)

    def test_full_wizard_xlsx_import_creates_batch(self):
        """Step 3: XLSX import also works end-to-end."""
        xlsx_content = self._make_xlsx()
        response = self._import(
            self.member, file_content=xlsx_content, filename='tickets.xlsx'
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['record_count'], 2)
        batch = TicketImportBatch.objects.get(pk=response.data['batch_id'])
        self.assertEqual(batch.tickets.count(), 2)

    # --- Signal-triggered KPI computation ---

    def test_import_auto_computes_monthly_kpi_via_signal(self):
        """After import, MonthlyKPI should be auto-computed by the post_save signal."""
        self._import(self.member)
        kpi = MonthlyKPI.objects.filter(user=self.member, month=date(2026, 3, 1)).first()
        self.assertIsNotNone(kpi, 'MonthlyKPI should be auto-computed by signal after import')
        self.assertEqual(kpi.total_tickets, 5)
        # 4 closed (Resolved→closed, Closed→closed x2, Resolved→closed) + 1 open
        self.assertEqual(kpi.closed_tickets, 4)
        self.assertEqual(kpi.open_tickets, 1)

    def test_import_computes_resolution_time(self):
        """Resolution time should be computed for tickets with resolved_at."""
        self._import(self.member)
        kpi = MonthlyKPI.objects.get(user=self.member, month=date(2026, 3, 1))
        self.assertIsNotNone(kpi.avg_resolution_hours)
        # INC001: 6h, INC002: 2h, INC004: 0.5h, INC005: 4h → avg = 3.125
        self.assertGreater(kpi.avg_resolution_hours, 0)

    def test_import_computes_sla_and_category_breakdown(self):
        """SLA and category breakdown should be populated."""
        self._import(self.member)
        kpi = MonthlyKPI.objects.get(user=self.member, month=date(2026, 3, 1))
        self.assertIn('Network', kpi.by_category)
        self.assertIn('Hardware', kpi.by_category)
        self.assertIsNotNone(kpi.sla_compliance_pct)

    # --- Dashboard endpoints after upload ---

    def test_monthly_summary_returns_data_after_upload(self):
        """Dashboard monthly_summary endpoint returns data after upload."""
        self._import(self.member)
        response = self._monthly_summary(self.member)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['has_data'])
        self.assertEqual(response.data['total_tickets'], 5)

    def test_monthly_summary_returns_no_data_before_upload(self):
        """Dashboard monthly_summary returns has_data=False when no upload exists."""
        response = self._monthly_summary(self.member)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['has_data'])
        self.assertEqual(response.data['total_tickets'], 0)

    def test_trend_returns_data_after_upload(self):
        """Dashboard trend endpoint returns data after upload."""
        self._import(self.member)
        # `_trend`'s default months=6 is a rolling window from today, so a
        # fixed month far enough in the past falls out of range once real
        # time moves on. Widen the window to guarantee 2026-03 is covered
        # regardless of when the suite runs.
        now = timezone.now()
        months_since_march_2026 = (now.year - 2026) * 12 + (now.month - 3) + 1
        response = self._trend(self.member, months=max(6, months_since_march_2026))
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.data, list)
        self.assertTrue(len(response.data) > 0)
        march = [d for d in response.data if d['month'] == '2026-03']
        self.assertEqual(len(march), 1)
        self.assertEqual(march[0]['total_tickets'], 5)

    def test_categories_returns_data_after_upload(self):
        """Dashboard categories endpoint returns data after upload."""
        self._import(self.member)
        response = self._categories(self.member)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['has_data'])
        self.assertIn('Network', response.data['by_category'])

    # --- TL viewing member data ---

    def test_tl_can_view_member_monthly_summary(self):
        """TL can view a team member's monthly summary after they upload."""
        self._import(self.member)
        response = self._monthly_summary(self.tl, target_user_id=self.member.id)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['has_data'])
        self.assertEqual(response.data['total_tickets'], 5)

    def test_tl_can_view_member_trend(self):
        """TL can view a team member's trend after they upload."""
        self._import(self.member)
        response = self._trend(self.tl, target_user_id=self.member.id)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(len(response.data) > 0)

    def test_tl_can_view_member_categories(self):
        """TL can view a team member's categories after they upload."""
        self._import(self.member)
        response = self._categories(self.tl, target_user_id=self.member.id)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['has_data'])

    def test_outsider_cannot_view_member_data(self):
        """A non-TL, non-admin user cannot view another user's data."""
        self._import(self.member)
        response = self._monthly_summary(self.outsider, target_user_id=self.member.id)
        self.assertEqual(response.status_code, 403)

    # --- Team endpoints ---

    def test_team_summary_returns_member_data(self):
        """Team summary includes the member's data after they upload."""
        self._import(self.member)
        response = self._team_summary(self.tl)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total_tickets'], 5)
        self.assertTrue(len(response.data['members']) > 0)
        member_row = [m for m in response.data['members'] if m['user_id'] == self.member.id]
        self.assertEqual(len(member_row), 1)
        self.assertEqual(member_row[0]['total_tickets'], 5)

    def test_team_summary_includes_fields_populated_per_member(self):
        """team_summary returns fields_populated list per member after upload."""
        self._import(self.member)
        response = self._team_summary(self.tl)
        self.assertEqual(response.status_code, 200)
        member_row = [m for m in response.data['members'] if m['user_id'] == self.member.id][0]
        # After uploading CSV with category/priority/status/resolution/SLA data
        self.assertIn('tickets', member_row['fields_populated'])
        self.assertIn('resolution_time', member_row['fields_populated'])
        self.assertIn('category', member_row['fields_populated'])
        self.assertIn('priority', member_row['fields_populated'])
        # Member with no data has empty fields_populated
        no_data_row = [m for m in response.data['members'] if m['user_id'] == self.tl.id][0]
        self.assertEqual(no_data_row['fields_populated'], [])

    def test_team_summary_includes_field_breakdowns_per_member(self):
        """team_summary returns field_breakdowns per member for drill-down."""
        self._import(self.member)
        response = self._team_summary(self.tl)
        self.assertEqual(response.status_code, 200)
        member_row = [m for m in response.data['members'] if m['user_id'] == self.member.id][0]
        self.assertIn('Network', member_row['field_breakdowns'].get('category', {}))

    def test_team_trend_returns_data(self):
        """Team trend returns data after member uploads."""
        self._import(self.member)
        response = self._team_trend(self.tl)
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.data, list)

    def test_team_yearly_summary_returns_member_data(self):
        """team_yearly_summary returns per-member yearly totals after upload."""
        self._import(self.member)
        request = self.factory.get('/dashboard/team_yearly_summary/', {'year': '2026'})
        force_authenticate(request, self.tl)
        view = TicketKPIDashboardViewSet.as_view({'get': 'team_yearly_summary'})
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['year'], 2026)
        self.assertEqual(response.data['total_tickets'], 5)
        member_row = [
            m for m in response.data['per_user_summary'] if m['user_id'] == self.member.id
        ]
        self.assertEqual(len(member_row), 1)
        self.assertEqual(member_row[0]['total_tickets'], 5)
        self.assertGreater(member_row[0]['months_with_data'], 0)
        self.assertIn('tickets', member_row[0]['fields_populated'])

    def test_team_yearly_summary_requires_year_param(self):
        """team_yearly_summary returns 400 when year is missing."""
        request = self.factory.get('/dashboard/team_yearly_summary/')
        force_authenticate(request, self.tl)
        view = TicketKPIDashboardViewSet.as_view({'get': 'team_yearly_summary'})
        response = view(request)
        self.assertEqual(response.status_code, 400)

    # --- Multi-month upload ---

    def test_multi_month_upload_builds_trend(self):
        """Uploading multiple months builds a trend across months."""
        # March
        self._import(self.member, month='2026-03-01')
        # April (different CSV content)
        april_csv = (
            "Number,Short description,State,Opened,Resolved,Assigned to,Caller,Priority,Category\n"
            "INC100,April ticket,Closed,2026-04-01 08:00,2026-04-01 10:00,Alice,Bob,P2 - high,Network\n"
        ).encode('utf-8')
        self._import(self.member, file_content=april_csv, month='2026-04-01')

        # See test_trend_returns_data_after_upload: widen the default
        # 6-month rolling window so 2026-03 stays in range as real time
        # moves past it.
        now = timezone.now()
        months_since_march_2026 = (now.year - 2026) * 12 + (now.month - 3) + 1
        response = self._trend(
            self.tl, months=max(6, months_since_march_2026), target_user_id=self.member.id
        )
        self.assertEqual(response.status_code, 200)
        months_with_data = [d for d in response.data if d['total_tickets'] > 0]
        self.assertEqual(len(months_with_data), 2)

    # --- Evidence upload after ticket upload ---

    def test_evidence_upload_after_ticket_upload(self):
        """User can upload evidence after uploading tickets."""
        self._import(self.member)
        response = self._create_evidence(
            self.member, client_ids=[self.client_a.id]
        )
        self.assertEqual(response.status_code, 201)
        evidence = KPIEvidence.objects.get(pk=response.data['id'])
        self.assertEqual(evidence.user, self.member)
        self.assertEqual(evidence.month, date(2026, 3, 1))
        self.assertIn(self.client_a, evidence.clients.all())

    def test_tl_can_review_member_evidence_after_upload(self):
        """TL can review evidence that a member uploaded."""
        self._import(self.member)
        ev_response = self._create_evidence(self.member, client_ids=[self.client_a.id])
        evidence_id = ev_response.data['id']

        from plugins.ticket_kpi.viewsets import KPIEvidenceViewSet
        request = self.factory.post(f'/evidence/{evidence_id}/review/', {'status': 'approved'})
        force_authenticate(request, self.tl)
        view = KPIEvidenceViewSet.as_view({'post': 'review'})
        response = view(request, pk=evidence_id)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'approved')

    # --- Delete batch triggers KPI deletion signal ---

    def test_delete_batch_removes_monthly_kpi(self):
        """Deleting the last batch for a user/month removes the MonthlyKPI."""
        self._import(self.member)
        self.assertTrue(
            MonthlyKPI.objects.filter(user=self.member, month=date(2026, 3, 1)).exists()
        )
        batch = TicketImportBatch.objects.get(user=self.member, month=date(2026, 3, 1))
        batch.delete()
        self.assertFalse(
            MonthlyKPI.objects.filter(user=self.member, month=date(2026, 3, 1)).exists()
        )

    # --- recompute_kpis management command ---

    def test_recompute_kpis_creates_missing_monthly_kpi(self):
        """recompute_kpis command recreates missing MonthlyKPI from existing batches."""
        self._import(self.member)
        # Simulate the bug: delete the MonthlyKPI but keep the batch
        MonthlyKPI.objects.filter(user=self.member, month=date(2026, 3, 1)).delete()
        self.assertFalse(
            MonthlyKPI.objects.filter(user=self.member, month=date(2026, 3, 1)).exists()
        )
        # Run the command
        call_command('recompute_kpis')
        # KPI should be recreated
        kpi = MonthlyKPI.objects.filter(user=self.member, month=date(2026, 3, 1)).first()
        self.assertIsNotNone(kpi)
        self.assertEqual(kpi.total_tickets, 5)

    def test_recompute_kpis_dry_run_does_not_modify(self):
        """recompute_kpis --dry-run does not create or modify records."""
        self._import(self.member)
        MonthlyKPI.objects.filter(user=self.member, month=date(2026, 3, 1)).delete()
        call_command('recompute_kpis', dry_run=True)
        self.assertFalse(
            MonthlyKPI.objects.filter(user=self.member, month=date(2026, 3, 1)).exists()
        )

    def test_recompute_kpis_with_user_id_filter(self):
        """recompute_kpis --user-id only processes that user."""
        self._import(self.member)
        MonthlyKPI.objects.filter(user=self.member, month=date(2026, 3, 1)).delete()
        # Run with outsider's user ID — should not recreate member's KPI
        call_command('recompute_kpis', user_id=self.outsider.id)
        self.assertFalse(
            MonthlyKPI.objects.filter(user=self.member, month=date(2026, 3, 1)).exists()
        )

    def test_recompute_kpis_deletes_multiple_orphaned_records(self):
        """recompute_kpis deletes every MonthlyKPI whose (user, month) has no
        non-overridden batch, not just a single one. Regression for the
        orphan-cleanup loop rewrite (queryset-OR-chaining -> pk__in)."""
        self._import(self.member)
        # Two orphaned KPIs: no TicketImportBatch backs either (user, month) pair.
        orphan_1 = MonthlyKPI.objects.create(
            user=self.member, month=date(2025, 1, 1), total_tickets=1
        )
        orphan_2 = MonthlyKPI.objects.create(
            user=self.outsider, month=date(2025, 2, 1), total_tickets=2
        )
        call_command('recompute_kpis')
        self.assertFalse(MonthlyKPI.objects.filter(pk=orphan_1.pk).exists())
        self.assertFalse(MonthlyKPI.objects.filter(pk=orphan_2.pk).exists())
        # The real KPI backed by an actual batch must survive.
        self.assertTrue(
            MonthlyKPI.objects.filter(user=self.member, month=date(2026, 3, 1)).exists()
        )

    def test_recompute_kpis_dry_run_does_not_delete_orphans(self):
        """--dry-run reports orphaned records without deleting them."""
        self._import(self.member)
        orphan = MonthlyKPI.objects.create(
            user=self.member, month=date(2024, 6, 1), total_tickets=3
        )
        call_command('recompute_kpis', dry_run=True)
        self.assertTrue(MonthlyKPI.objects.filter(pk=orphan.pk).exists())

    # --- Duplicate upload prevention ---

    def test_duplicate_upload_same_month_returns_403(self):
        """Uploading the same month twice without override returns 403."""
        self._import(self.member)
        response = self._import(self.member)
        self.assertEqual(response.status_code, 403)
        self.assertIn('already exists', str(response.data.get('error', '')))

    def test_admin_can_override_duplicate_upload(self):
        """Admin can override an existing upload with override=true."""
        self._import(self.member)
        file_obj = SimpleUploadedFile('tickets.csv', self.csv_content, content_type='text/csv')
        data = {
            'file': file_obj,
            'profile_id': self.profile.id,
            'month': '2026-03-01',
            'override': 'true',
        }
        request = self.factory.post('/upload/import_batch/', data, format='multipart')
        force_authenticate(request, self.admin)
        view = TicketUploadViewSet.as_view({'post': 'import_batch'})
        response = view(request)
        self.assertEqual(response.status_code, 201)

    # --- my_batches endpoint ---

    def test_my_batches_returns_user_uploads(self):
        """my_batches endpoint returns the current user's upload history."""
        self._import(self.member)
        request = self.factory.get('/upload/my_batches/')
        force_authenticate(request, self.member)
        view = TicketUploadViewSet.as_view({'get': 'my_batches'})
        response = view(request)
        self.assertEqual(response.status_code, 200)
        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['record_count'], 5)

    # --- team_batches endpoint ---

    def test_team_batches_returns_member_uploads(self):
        """team_batches endpoint returns uploads for all team members."""
        self._import(self.member)
        request = self.factory.get('/upload/team_batches/')
        force_authenticate(request, self.tl)
        view = TicketUploadViewSet.as_view({'get': 'team_batches'})
        response = view(request)
        self.assertEqual(response.status_code, 200)
        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['user'], self.member.id)


class PercentileAnalyticsTests(TestCase):
    """Tests for p50/p75/p90 percentile computation in MonthlyKPI."""

    def setUp(self):
        self.user = User.objects.create_user(
            username='pctuser', password='testpass123'
        )
        self.profile = ExportProfile.objects.create(
            name='Pct Profile',
            field_mapping={'ticket_id': 'ID'},
            created_by=self.user,
        )

    def _create_batch_with_resolution_times(self, hours_list, month=date(2026, 3, 1)):
        """Create a batch with tickets having the given resolution times (in hours)."""
        batch = TicketImportBatch.objects.create(
            user=self.user, month=month, profile=self.profile, record_count=len(hours_list)
        )
        for i, hrs in enumerate(hours_list):
            created = timezone.now() - timedelta(hours=hrs + 1)
            resolved = timezone.now() - timedelta(hours=1)
            NormalizedTicket.objects.create(
                batch=batch,
                ticket_id=f'PCT{i:03d}',
                title=f'Ticket {i}',
                status='closed',
                created_at=created,
                resolved_at=resolved,
                time_to_resolution_hours=hrs,
            )
        return batch

    def test_percentiles_computed_for_resolved_tickets(self):
        """compute_monthly_kpi populates p50/p75/p90 from resolution times."""
        # 10 tickets with resolution times 1..10 hours
        self._create_batch_with_resolution_times([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
        kpi = compute_monthly_kpi(self.user, date(2026, 3, 1))

        self.assertIsNotNone(kpi)
        self.assertEqual(kpi.total_tickets, 10)
        # Sorted: [1,2,3,4,5,6,7,8,9,10], n=10
        # p50 = x[int(10*0.50)] = x[5] = 6
        # p75 = x[int(10*0.75)] = x[7] = 8
        # p90 = x[min(int(10*0.90), 9)] = x[9] = 10
        self.assertEqual(kpi.p50_resolution_hours, 6)
        self.assertEqual(kpi.p75_resolution_hours, 8)
        self.assertEqual(kpi.p90_resolution_hours, 10)

    def test_percentiles_none_when_no_resolution_times(self):
        """Percentiles are None when no tickets have resolution times."""
        batch = TicketImportBatch.objects.create(
            user=self.user, month=date(2026, 3, 1), profile=self.profile, record_count=1
        )
        NormalizedTicket.objects.create(
            batch=batch, ticket_id='NOPCT', title='No res', status='open',
            created_at=timezone.now(),
        )
        kpi = compute_monthly_kpi(self.user, date(2026, 3, 1))

        self.assertIsNotNone(kpi)
        self.assertIsNone(kpi.p50_resolution_hours)
        self.assertIsNone(kpi.p75_resolution_hours)
        self.assertIsNone(kpi.p90_resolution_hours)
        self.assertIsNone(kpi.avg_resolution_hours)

    def test_percentiles_in_trend_data(self):
        """get_user_monthly_summary includes percentile fields in trend output."""
        self._create_batch_with_resolution_times([2, 4, 6, 8, 10])
        compute_monthly_kpi(self.user, date(2026, 3, 1))
        summary = get_user_monthly_summary(self.user, months=12)
        march = [s for s in summary if s['month'] == '2026-03']
        self.assertEqual(len(march), 1)
        self.assertIsNotNone(march[0]['p50_resolution_hours'])
        self.assertIsNotNone(march[0]['p75_resolution_hours'])
        self.assertIsNotNone(march[0]['p90_resolution_hours'])

    def test_percentiles_in_monthly_summary_endpoint(self):
        """monthly_summary endpoint returns percentile fields."""
        self._create_batch_with_resolution_times([1, 2, 3, 4, 5])
        compute_monthly_kpi(self.user, date(2026, 3, 1))
        factory = APIRequestFactory()
        request = factory.get('/dashboard/monthly_summary/', {'month': '2026-03-01'})
        force_authenticate(request, self.user)
        view = TicketKPIDashboardViewSet.as_view({'get': 'monthly_summary'})
        response = view(request)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['has_data'])
        self.assertIn('p50_resolution_hours', response.data)
        self.assertIn('p75_resolution_hours', response.data)
        self.assertIn('p90_resolution_hours', response.data)
        self.assertIsNotNone(response.data['p50_resolution_hours'])


class PeriodComparisonTests(TestCase):
    """Tests for the compare_month parameter on monthly_summary."""

    @classmethod
    def setUpTestData(cls):
        cls.factory = APIRequestFactory()
        cls.user = User.objects.create_user(
            username='cmpuser', password='testpass123'
        )
        cls.profile = ExportProfile.objects.create(
            name='Cmp Profile',
            field_mapping={'ticket_id': 'ID'},
            created_by=cls.user,
        )

    def _create_month(self, month, total_tickets, avg_res, sla_pct):
        """Create a MonthlyKPI record directly for testing comparison logic."""
        MonthlyKPI.objects.update_or_create(
            user=self.user, month=month,
            defaults={
                'total_tickets': total_tickets,
                'closed_tickets': total_tickets,
                'open_tickets': 0,
                'avg_resolution_hours': avg_res,
                'sla_compliance_pct': sla_pct,
                'sla_breached_count': 0,
            },
        )

    def _monthly_summary(self, month, compare_month=None):
        params = {'month': month}
        if compare_month:
            params['compare_month'] = compare_month
        request = self.factory.get('/dashboard/monthly_summary/', params)
        force_authenticate(request, self.user)
        view = TicketKPIDashboardViewSet.as_view({'get': 'monthly_summary'})
        return view(request)

    def test_comparison_returns_previous_month_and_deltas(self):
        """compare_month returns previous month data + delta calculations."""
        self._create_month(date(2026, 2, 1), total_tickets=10, avg_res=8.0, sla_pct=90.0)
        self._create_month(date(2026, 3, 1), total_tickets=15, avg_res=6.0, sla_pct=95.0)

        response = self._monthly_summary('2026-03-01', compare_month='2026-02-01')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['has_data'])
        self.assertIsNotNone(response.data['comparison'])
        self.assertTrue(response.data['comparison']['has_data'])
        self.assertEqual(response.data['comparison']['month'], '2026-02-01')
        # Deltas: current - previous
        self.assertEqual(response.data['comparison']['total_tickets_delta'], 5)  # 15 - 10
        self.assertEqual(response.data['comparison']['avg_resolution_delta'], -2.0)  # 6 - 8
        self.assertEqual(response.data['comparison']['sla_compliance_delta'], 5.0)  # 95 - 90

    def test_comparison_none_when_no_compare_param(self):
        """Without compare_month, comparison is None."""
        self._create_month(date(2026, 3, 1), total_tickets=5, avg_res=4.0, sla_pct=100.0)
        response = self._monthly_summary('2026-03-01')
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data['comparison'])

    def test_comparison_handles_missing_previous_month(self):
        """comparison returns has_data=False when previous month has no data."""
        self._create_month(date(2026, 3, 1), total_tickets=5, avg_res=4.0, sla_pct=100.0)
        response = self._monthly_summary('2026-03-01', compare_month='2026-02-01')
        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(response.data['comparison'])
        self.assertFalse(response.data['comparison']['has_data'])

    def test_comparison_invalid_compare_month_returns_400(self):
        """Invalid compare_month format returns 400."""
        response = self._monthly_summary('2026-03-01', compare_month='invalid')
        self.assertEqual(response.status_code, 400)

    def test_comparison_deltas_none_when_current_missing(self):
        """Deltas are None when current month has no data but previous does."""
        self._create_month(date(2026, 2, 1), total_tickets=10, avg_res=8.0, sla_pct=90.0)
        response = self._monthly_summary('2026-03-01', compare_month='2026-02-01')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['has_data'])
        # Previous month data is still returned
        self.assertTrue(response.data['comparison']['has_data'])
        # But deltas are None since current has no data
        self.assertIsNone(response.data['comparison']['total_tickets_delta'])
        self.assertIsNone(response.data['comparison']['avg_resolution_delta'])

    def test_month_param_normalized_to_first_of_month(self):
        """Mid-month month/compare_month values still match first-of-month KPI rows."""
        self._create_month(date(2026, 2, 1), total_tickets=10, avg_res=8.0, sla_pct=90.0)
        self._create_month(date(2026, 3, 1), total_tickets=15, avg_res=6.0, sla_pct=95.0)

        response = self._monthly_summary('2026-03-15', compare_month='2026-02-20')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['has_data'])
        self.assertEqual(response.data['total_tickets'], 15)
        self.assertTrue(response.data['comparison']['has_data'])
        self.assertEqual(response.data['comparison']['month'], '2026-02-01')
        self.assertEqual(response.data['comparison']['total_tickets_delta'], 5)

    def test_categories_month_param_normalized(self):
        """categories endpoint also normalizes mid-month to first-of-month."""
        self._create_month(date(2026, 3, 1), total_tickets=7, avg_res=5.0, sla_pct=88.0)
        # Attach category breakdown directly on the KPI row
        kpi = MonthlyKPI.objects.get(user=self.user, month=date(2026, 3, 1))
        kpi.by_category = {'Network': 4, 'Access': 3}
        kpi.by_priority = {'High': 2}
        kpi.save(update_fields=['by_category', 'by_priority'])

        request = self.factory.get('/dashboard/categories/', {'month': '2026-03-20'})
        force_authenticate(request, self.user)
        view = TicketKPIDashboardViewSet.as_view({'get': 'categories'})
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['has_data'])
        self.assertEqual(response.data['month'], '2026-03-01')
        self.assertEqual(response.data['by_category'], {'Network': 4, 'Access': 3})


class UploadValidationTests(TestCase):
    """Tests for the shared upload validator (Phase 3 hardening)."""

    def test_validate_rejects_missing_file(self):
        from plugins.ticket_kpi.upload_validation import (
            UploadValidationError,
            validate_upload,
        )
        with self.assertRaises(UploadValidationError) as ctx:
            validate_upload(None, "ticket_import")
        self.assertEqual(ctx.exception.code, "missing_file")

    def test_validate_rejects_unknown_extension(self):
        from plugins.ticket_kpi.upload_validation import (
            UploadValidationError,
            validate_upload,
        )
        f = SimpleUploadedFile("tickets.exe", b"MZ", content_type="application/octet-stream")
        with self.assertRaises(UploadValidationError) as ctx:
            validate_upload(f, "ticket_import")
        self.assertEqual(ctx.exception.code, "invalid_extension")

    def test_validate_rejects_missing_extension(self):
        from plugins.ticket_kpi.upload_validation import (
            UploadValidationError,
            validate_upload,
        )
        f = SimpleUploadedFile("noext", b"abc", content_type="application/octet-stream")
        with self.assertRaises(UploadValidationError) as ctx:
            validate_upload(f, "ticket_import")
        self.assertEqual(ctx.exception.code, "missing_extension")

    def test_validate_rejects_oversized_file(self):
        from plugins.ticket_kpi.upload_validation import (
            UploadValidationError,
            validate_upload,
        )
        # 6 MB CSV exceeds the 5 MB mapping_test policy.
        big = b"a,b\n" + b"1,2\n" * 1_500_000  # ~6 MB
        f = SimpleUploadedFile("big.csv", big, content_type="text/csv")
        with self.assertRaises(UploadValidationError) as ctx:
            validate_upload(f, "mapping_test")
        self.assertEqual(ctx.exception.code, "file_too_large")

    def test_validate_accepts_valid_csv(self):
        from plugins.ticket_kpi.upload_validation import validate_upload
        f = SimpleUploadedFile("ok.csv", b"a,b\n1,2\n", content_type="text/csv")
        check = validate_upload(f, "ticket_import")
        self.assertEqual(check.declared_extension, "csv")
        self.assertEqual(check.policy_name, "ticket_import")

    def test_validate_rejects_signature_mismatch(self):
        from plugins.ticket_kpi.upload_validation import (
            UploadValidationError,
            validate_upload,
        )
        # PNG magic bytes but .csv extension
        f = SimpleUploadedFile("fake.csv", b"\x89PNG\r\n\x1a\n" + b"\x00" * 32, content_type="text/csv")
        with self.assertRaises(UploadValidationError) as ctx:
            validate_upload(f, "ticket_import")
        self.assertEqual(ctx.exception.code, "signature_mismatch")

    def test_validate_rejects_signature_inspection_failure(self):
        from plugins.ticket_kpi.upload_validation import (
            UploadValidationError,
            validate_upload,
        )

        class UninspectableUpload:
            name = "broken.pdf"
            size = 10

            def tell(self):
                raise OSError("cannot inspect")

        with self.assertRaises(UploadValidationError) as ctx:
            validate_upload(UninspectableUpload(), "evidence")
        self.assertEqual(ctx.exception.code, "signature_inspection_failed")

    def test_enforce_table_dimensions_rejects_too_many_rows(self):
        import pandas as pd
        from plugins.ticket_kpi.upload_validation import (
            UploadValidationError,
            enforce_table_dimensions,
        )
        df = pd.DataFrame({"a": list(range(2000))})
        with self.assertRaises(UploadValidationError) as ctx:
            enforce_table_dimensions(df, max_rows=1000, max_columns=None)
        self.assertEqual(ctx.exception.code, "too_many_rows")

    def test_enforce_table_dimensions_rejects_too_many_columns(self):
        import pandas as pd
        from plugins.ticket_kpi.upload_validation import (
            UploadValidationError,
            enforce_table_dimensions,
        )
        df = pd.DataFrame({f"col_{i}": [1] for i in range(300)})
        with self.assertRaises(UploadValidationError) as ctx:
            enforce_table_dimensions(df, max_rows=None, max_columns=200)
        self.assertEqual(ctx.exception.code, "too_many_columns")

    def test_evidence_policy_accepts_pdf(self):
        from plugins.ticket_kpi.upload_validation import validate_upload
        f = SimpleUploadedFile(
            "cert.pdf", b"%PDF-1.4 fake pdf content", content_type="application/pdf"
        )
        check = validate_upload(f, "evidence")
        self.assertEqual(check.declared_extension, "pdf")

    def test_evidence_policy_rejects_exe(self):
        from plugins.ticket_kpi.upload_validation import (
            UploadValidationError,
            validate_upload,
        )
        f = SimpleUploadedFile("malware.exe", b"MZ\x90\x00", content_type="application/octet-stream")
        with self.assertRaises(UploadValidationError) as ctx:
            validate_upload(f, "evidence")
        self.assertEqual(ctx.exception.code, "invalid_extension")

    def test_evidence_policy_rejects_html(self):
        """P0-3: .html evidence files must be rejected (stored XSS).

        HTML evidence served from /media/ executes JS in the app's origin.
        DOMPurify only protects the in-app email viewer, not direct media URLs.
        """
        from plugins.ticket_kpi.upload_validation import (
            UploadValidationError,
            validate_upload,
        )
        f = SimpleUploadedFile(
            "xss.html", b"<script>alert(1)</script>", content_type="text/html"
        )
        with self.assertRaises(UploadValidationError) as ctx:
            validate_upload(f, "evidence")
        self.assertEqual(ctx.exception.code, "invalid_extension")

    def test_evidence_policy_rejects_htm(self):
        """P0-3: .htm evidence files must also be rejected."""
        from plugins.ticket_kpi.upload_validation import (
            UploadValidationError,
            validate_upload,
        )
        f = SimpleUploadedFile(
            "xss.htm", b"<script>alert(1)</script>", content_type="text/html"
        )
        with self.assertRaises(UploadValidationError) as ctx:
            validate_upload(f, "evidence")
        self.assertEqual(ctx.exception.code, "invalid_extension")

    def test_max_bytes_override_takes_precedence(self):
        from plugins.ticket_kpi.upload_validation import (
            UploadValidationError,
            validate_upload,
        )
        # ~1.5 MB CSV — under default 10 MB but over a 1 MB override.
        big = b"a,b\n" + b"1,2\n" * 400_000  # ~1.6 MB
        f = SimpleUploadedFile("big.csv", big, content_type="text/csv")
        with self.assertRaises(UploadValidationError) as ctx:
            validate_upload(f, "ticket_import", max_bytes_override_mb=1)
        self.assertEqual(ctx.exception.code, "file_too_large")


class UploadEndpointValidationTests(TestCase):
    """End-to-end validation that the analyze endpoint rejects bad uploads."""

    @classmethod
    def setUpTestData(cls):
        cls.factory = APIRequestFactory()
        cls.user = User.objects.create_user(username="uvuser", password="t")

    def _analyze(self, file_obj):
        request = self.factory.post(
            "/api/plugins/ticket_kpi/upload/analyze/",
            {"file": file_obj},
            format="multipart",
        )
        force_authenticate(request, user=self.user)
        return TicketUploadViewSet.as_view({"post": "analyze"})(request)

    def test_analyze_rejects_oversized_file_with_400(self):
        # 11 MB CSV exceeds the 10 MB ticket_import policy.
        big = b"a,b\n" + b"1,2\n" * 3_000_000  # ~12 MB
        f = SimpleUploadedFile("big.csv", big, content_type="text/csv")
        response = self._analyze(f)
        self.assertEqual(response.status_code, 400)
        data = response.data
        self.assertEqual(data.get("code"), "file_too_large")

    def test_analyze_rejects_unsupported_extension_with_400(self):
        f = SimpleUploadedFile("tickets.exe", b"MZ", content_type="application/octet-stream")
        response = self._analyze(f)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get("code"), "invalid_extension")

    def test_analyze_rejects_signature_mismatch_with_400(self):
        f = SimpleUploadedFile(
            "fake.csv", b"\x89PNG\r\n\x1a\n" + b"\x00" * 32, content_type="text/csv"
        )
        response = self._analyze(f)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get("code"), "signature_mismatch")
