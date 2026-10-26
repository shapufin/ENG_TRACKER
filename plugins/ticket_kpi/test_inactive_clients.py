"""Ticket KPI cannot attach new work to an archived (inactive) client (plan A2)."""
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.overtime.models.core import Client

from .models import ExportProfile
from .serializers import ExportProfileSerializer
from .viewsets import KPIEvidenceViewSet, TicketUploadViewSet

CSV = (
    "Number,Short description,State,Opened,Resolved,Assigned to,Caller,Priority,Category\n"
    "INC001,Test ticket,Resolved,2026-03-01 08:00,2026-03-01 14:00,User A,User B,P1 - critical,Network\n"
).encode('utf-8')


class InactiveClientTicketKpiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.factory = APIRequestFactory()
        cls.admin = User.objects.create_user(username='ik_admin', password='x', is_staff=True)
        cls.member = User.objects.create_user(username='ik_member', password='x')
        cls.live = Client.objects.create(name='Live', code='LIVE')
        cls.gone = Client.objects.create(name='Gone', code='GONE', is_active=False)
        cls.profile = ExportProfile.objects.create(
            name='P',
            field_mapping={
                'ticket_id': 'Number', 'title': 'Short description', 'status': 'State',
                'created_at': 'Opened', 'resolved_at': 'Resolved', 'assignee': 'Assigned to',
                'requester': 'Caller', 'priority': 'Priority', 'category': 'Category',
            },
            is_active=True, is_global=True, created_by=cls.admin,
        )

    def _upload(self, user, client_ids):
        data = {
            'file': SimpleUploadedFile('tickets.csv', CSV, content_type='text/csv'),
            'profile_id': self.profile.id,
            'month': '2026-03-01',
            'client_ids': ','.join(str(c) for c in client_ids),
        }
        request = self.factory.post('/upload/import_batch/', data, format='multipart')
        force_authenticate(request, user)
        return TicketUploadViewSet.as_view({'post': 'import_batch'})(request)

    def _evidence(self, user, client_ids):
        data = {
            'file': SimpleUploadedFile('cert.pdf', b'%PDF-1.4 x', content_type='application/pdf'),
            'month': '2026-03-01',
            'evidence_type': 'document',
            'description': 'd',
            'client_ids': ','.join(str(c) for c in client_ids),
        }
        request = self.factory.post('/evidence/', data, format='multipart')
        force_authenticate(request, user)
        return KPIEvidenceViewSet.as_view({'post': 'create'})(request)

    def test_upload_rejects_inactive_client(self):
        response = self._upload(self.admin, [self.gone.pk])
        self.assertEqual(response.status_code, 400)

    def test_upload_accepts_active_client(self):
        response = self._upload(self.admin, [self.live.pk])
        self.assertEqual(response.status_code, 201)

    def test_evidence_rejects_inactive_client_even_when_still_assigned(self):
        self.member.profile.clients.add(self.gone)
        response = self._evidence(self.member, [self.gone.pk])
        self.assertEqual(response.status_code, 400)

    def test_export_profile_rejects_new_inactive_client(self):
        serializer = ExportProfileSerializer(
            self.profile, data={'assigned_client_ids': [self.gone.pk]}, partial=True,
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn('assigned_client_ids', serializer.errors)

    def test_export_profile_keeps_already_linked_inactive_client(self):
        self.profile.assigned_clients.add(self.gone)
        serializer = ExportProfileSerializer(
            self.profile, data={'assigned_client_ids': [self.gone.pk, self.live.pk]}, partial=True,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
