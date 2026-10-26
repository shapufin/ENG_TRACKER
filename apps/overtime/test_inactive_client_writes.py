"""An archived (inactive) client cannot receive new records (plan A2).

New links are rejected; editing an old record that already points at the client is not.
"""
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.test import APITestCase

from apps.overtime.models import Client, OvertimeLog
from apps.overtime.services.client_lifecycle import archived_client_error, ensure_client_active
from apps.standby.models import StandbyLog
from apps.users.serializers import UserProfileSerializer
from core.utils.timezone_local import business_today


class EnsureClientActiveTests(APITestCase):
    def test_active_client_passes(self):
        ensure_client_active(Client.objects.create(name='Live', code='LIVE'))

    def test_inactive_client_raises_with_its_name(self):
        client = Client.objects.create(name='Gone', code='GONE', is_active=False)
        with self.assertRaises(DjangoValidationError) as ctx:
            ensure_client_active(client)
        self.assertIn('Gone', ctx.exception.messages[0])

    def test_archived_client_error_lists_only_inactive(self):
        live = Client.objects.create(name='Live', code='LIVE')
        gone = Client.objects.create(name='Gone', code='GONE', is_active=False)
        self.assertIsNone(archived_client_error([live]))
        self.assertIn('Gone', archived_client_error([live, gone]))
        self.assertNotIn('Live', archived_client_error([live, gone]))


class InactiveClientWriteTests(APITestCase):
    def setUp(self):
        self.today = business_today()
        self.user = User.objects.create_user(username='iw_user', password='x')
        self.live = Client.objects.create(name='Live', code='LIVE')
        self.gone = Client.objects.create(name='Gone', code='GONE', is_active=False)
        self.client.force_authenticate(self.user)

    def _ot_payload(self, client):
        return {'client': client.pk, 'date': self.today.isoformat(), 'hours': 2}

    # --- overtime -----------------------------------------------------
    def test_overtime_create_rejects_inactive_client(self):
        response = self.client.post('/api/overtime/logs/', self._ot_payload(self.gone), format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('client', response.data)
        self.assertFalse(OvertimeLog.objects.exists())

    def test_overtime_create_accepts_active_client(self):
        response = self.client.post('/api/overtime/logs/', self._ot_payload(self.live), format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_overtime_update_rejects_switching_to_inactive_client(self):
        log = OvertimeLog.objects.create(
            user=self.user, client=self.live, date=self.today, hours=2, status='pending',
        )
        response = self.client.patch(
            f'/api/overtime/logs/{log.pk}/', {'client': self.gone.pk}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        log.refresh_from_db()
        self.assertEqual(log.client_id, self.live.pk)

    def test_overtime_update_keeps_existing_inactive_client(self):
        log = OvertimeLog.objects.create(
            user=self.user, client=self.gone, date=self.today, hours=2, status='pending',
        )
        response = self.client.patch(
            f'/api/overtime/logs/{log.pk}/',
            {'client': self.gone.pk, 'description': 'edited'}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    # --- standby ------------------------------------------------------
    def _sb_payload(self, ids):
        return {'date': self.today.isoformat(), 'hours': 8, 'client_ids': ids}

    def test_standby_create_rejects_inactive_client(self):
        response = self.client.post(
            '/api/standby/logs/', self._sb_payload([self.live.pk, self.gone.pk]), format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('client_ids', response.data)
        self.assertFalse(StandbyLog.objects.exists())

    def test_standby_update_rejects_adding_inactive_client(self):
        log = StandbyLog.objects.create(user=self.user, date=self.today, hours=8, status='pending')
        log.clients.add(self.live)
        response = self.client.patch(
            f'/api/standby/logs/{log.pk}/',
            self._sb_payload([self.live.pk, self.gone.pk]), format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(list(log.clients.values_list('pk', flat=True)), [self.live.pk])

    def test_standby_update_keeps_already_linked_inactive_client(self):
        log = StandbyLog.objects.create(user=self.user, date=self.today, hours=8, status='pending')
        log.clients.add(self.gone)
        response = self.client.patch(
            f'/api/standby/logs/{log.pk}/', self._sb_payload([self.gone.pk]), format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(list(log.clients.values_list('pk', flat=True)), [self.gone.pk])

    # --- user assignment through the admin profile serializer -----------
    def test_profile_serializer_rejects_assigning_inactive_client(self):
        serializer = UserProfileSerializer(
            self.user.profile, data={'clients': [self.gone.pk]}, partial=True,
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn('clients', serializer.errors)

    def test_profile_serializer_keeps_already_assigned_inactive_client(self):
        self.user.profile.clients.add(self.gone)
        serializer = UserProfileSerializer(
            self.user.profile, data={'clients': [self.gone.pk, self.live.pk]}, partial=True,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
