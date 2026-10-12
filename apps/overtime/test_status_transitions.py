from datetime import date
from uuid import uuid4

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.overtime.models import Client, OvertimeLog


class OvertimeStatusTransitionTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.employee = User.objects.create_user(username=f'ot_emp_{uuid4().hex[:6]}', password='x')
        self.staff = User.objects.create_user(username=f'ot_staff_{uuid4().hex[:6]}', password='x', is_staff=True)
        self.client_obj = Client.objects.create(name=f'C{uuid4().hex[:8]}', code=f'C{uuid4().hex[:8]}')
        self.entry = OvertimeLog.objects.create(
            user=self.employee, client=self.client_obj, date=date(2026, 9, 14),
            hours=2, status='approved',
        )
        self.api.force_authenticate(user=self.staff)

    def test_rejecting_an_approved_entry_is_refused_and_status_is_kept(self):
        response = self.api.post(
            f'/api/overtime/logs/{self.entry.pk}/reject/', {'rejection_reason': 'x'}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.status, 'approved')

    def test_approving_an_approved_entry_is_refused(self):
        response = self.api.post(f'/api/overtime/logs/{self.entry.pk}/approve/', {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
