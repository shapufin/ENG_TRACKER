"""F8 (ruling R4, 2026-11-16): the owner's edit of a rejected overtime or standby entry resubmits it."""
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from apps.overtime.models import Client, OvertimeLog
from apps.standby.models import StandbyLog
from core.utils.timezone_local import business_today


class ResubmitRejectedTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='f8_emp', password='x')
        self.api = APIClient()
        self.api.force_authenticate(self.user)
        self.day = business_today()

    def test_editing_a_rejected_standby_entry_returns_it_to_pending(self):
        log = StandbyLog.objects.create(
            user=self.user, date=self.day, hours=4, status='rejected', rejection_reason='no',
        )
        response = self.api.patch(f'/api/standby/logs/{log.pk}/', {'hours': 5}, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        log.refresh_from_db()
        self.assertEqual((log.status, log.rejection_reason, log.approved_by), ('pending', '', None))
        self.assertIsNotNone(log.submitted_at)

    def test_editing_a_rejected_overtime_entry_returns_it_to_pending(self):
        client = Client.objects.create(name='F8', code='F8C')
        log = OvertimeLog.objects.create(
            user=self.user, client=client, date=self.day, hours=2, status='rejected', rejection_reason='no',
        )
        response = self.api.patch(f'/api/overtime/logs/{log.pk}/', {'hours': 3}, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        log.refresh_from_db()
        self.assertEqual((log.status, log.rejection_reason), ('pending', ''))

    def test_editing_a_pending_entry_keeps_it_pending_and_untouched_reason(self):
        log = StandbyLog.objects.create(user=self.user, date=self.day, hours=4, status='pending')
        self.api.patch(f'/api/standby/logs/{log.pk}/', {'hours': 5}, format='json')
        log.refresh_from_db()
        self.assertEqual(log.status, 'pending')
