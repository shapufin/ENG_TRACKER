"""A client delete must never destroy records that have to be kept.

Plan A1 of ``docs/superpowers/plans/2026-10-26-client-archive.md``: overtime logs
block the delete (PROTECT), standby and other M2M links block it through a
``pre_delete`` guard so queryset deletes and the shell are covered too, and the
API answers 409 with counts instead of a 500.
"""
from datetime import date

from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import ProtectedError
from rest_framework import status
from rest_framework.test import APITestCase

from apps.overtime.models import Client, OvertimeLog
from apps.standby.models import StandbyLog


class ClientDeleteGuardTests(APITestCase):
    def setUp(self):
        self.staff = User.objects.create_user(username='cd_staff', password='x', is_staff=True)
        self.owner = User.objects.create_user(username='cd_owner', password='x')
        self.client_obj = Client.objects.create(name='Acme', code='ACME')

    def _overtime(self):
        return OvertimeLog.objects.create(
            user=self.owner, client=self.client_obj, date=date(2026, 9, 1), hours=2,
        )

    def _standby(self):
        log = StandbyLog.objects.create(user=self.owner, date=date(2026, 9, 2), hours=8)
        log.clients.add(self.client_obj)
        return log

    def test_model_delete_is_blocked_by_overtime_log(self):
        self._overtime()
        with self.assertRaises(ProtectedError):
            self.client_obj.delete()
        self.assertEqual(OvertimeLog.objects.count(), 1)
        self.assertTrue(Client.objects.filter(pk=self.client_obj.pk).exists())

    def test_queryset_delete_is_blocked_by_overtime_log(self):
        self._overtime()
        with self.assertRaises(ProtectedError):
            Client.objects.filter(pk=self.client_obj.pk).delete()
        self.assertEqual(OvertimeLog.objects.count(), 1)

    # The guard raises inside Django's delete transaction, so these tests wrap the
    # call in a savepoint (as any caller already inside a transaction must).
    def test_model_delete_is_blocked_by_standby_link(self):
        self._standby()
        with self.assertRaises(ProtectedError):
            with transaction.atomic():
                self.client_obj.delete()
        self.assertTrue(Client.objects.filter(pk=self.client_obj.pk).exists())
        self.assertEqual(StandbyLog.objects.get().clients.count(), 1)

    def test_queryset_delete_is_blocked_by_standby_link(self):
        self._standby()
        with self.assertRaises(ProtectedError):
            with transaction.atomic():
                Client.objects.filter(pk=self.client_obj.pk).delete()
        self.assertTrue(Client.objects.filter(pk=self.client_obj.pk).exists())

    def test_api_delete_blocked_by_standby_link_only(self):
        self._standby()
        self.client.force_authenticate(self.staff)
        response = self.client.delete(f'/api/overtime/clients/{self.client_obj.pk}/')
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['counts'], {'standby_logs': 1})
        self.assertTrue(Client.objects.filter(pk=self.client_obj.pk).exists())

    def test_user_assignment_alone_does_not_block_delete(self):
        self.owner.profile.clients.add(self.client_obj)
        self.client_obj.delete()
        self.assertFalse(Client.objects.filter(pk=self.client_obj.pk).exists())

    def test_unused_client_still_deletes(self):
        self.client_obj.delete()
        self.assertFalse(Client.objects.filter(pk=self.client_obj.pk).exists())

    def test_api_delete_returns_409_with_counts(self):
        self._overtime()
        self._standby()
        self.client.force_authenticate(self.staff)
        response = self.client.delete(f'/api/overtime/clients/{self.client_obj.pk}/')
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['counts'], {'overtime_logs': 1, 'standby_logs': 1})
        self.assertTrue(Client.objects.filter(pk=self.client_obj.pk).exists())
        self.assertEqual(OvertimeLog.objects.count(), 1)

    def test_api_delete_unused_client_returns_204(self):
        self.client.force_authenticate(self.staff)
        response = self.client.delete(f'/api/overtime/clients/{self.client_obj.pk}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Client.objects.filter(pk=self.client_obj.pk).exists())
