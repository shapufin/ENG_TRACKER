"""Archive, unarchive, lifecycle info and the delete gates (plan A3)."""
from datetime import date

from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APITestCase

from apps.overtime.models import Client, OvertimeLog
from apps.reports.models import AuditLog
from apps.standby.models import StandbyLog
from plugins.onboarding.models import Folder


class ClientLifecycleApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(username='lc_admin', password='x')
        self.staff = User.objects.create_user(username='lc_staff', password='x', is_staff=True)
        self.member = User.objects.create_user(username='lc_member', password='x')
        self.other = User.objects.create_user(username='lc_other', password='x')
        self.client_obj = Client.objects.create(name='Acme', code='ACME')
        self.member.profile.clients.add(self.client_obj)
        self.other.profile.clients.add(self.client_obj)
        self.url = f'/api/overtime/clients/{self.client_obj.pk}/'

    def _as(self, user):
        self.client.force_authenticate(user)

    def _archive(self):
        self.client_obj.is_active = False
        self.client_obj.save(update_fields=['is_active'])

    # --- archive / unarchive -------------------------------------------
    def test_archive_is_superuser_only(self):
        for user in (self.staff, self.member):
            self._as(user)
            response = self.client.post(f'{self.url}archive/')
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, user.username)
        self.client_obj.refresh_from_db()
        self.assertTrue(self.client_obj.is_active)

    def test_archive_deactivates_and_unassigns_all_users(self):
        self._as(self.admin)
        response = self.client.post(f'{self.url}archive/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['users_unassigned'], 2)
        self.client_obj.refresh_from_db()
        self.assertFalse(self.client_obj.is_active)
        self.assertFalse(self.member.profile.clients.exists())
        self.assertFalse(self.other.profile.clients.exists())

    def test_archive_keeps_every_record_and_link(self):
        OvertimeLog.objects.create(
            user=self.member, client=self.client_obj, date=date(2026, 9, 1), hours=2,
        )
        standby = StandbyLog.objects.create(user=self.member, date=date(2026, 9, 2), hours=8)
        standby.clients.add(self.client_obj)
        self._as(self.admin)
        self.client.post(f'{self.url}archive/')
        self.assertEqual(OvertimeLog.objects.filter(client=self.client_obj).count(), 1)
        self.assertEqual(standby.clients.count(), 1)

    def test_archive_twice_is_a_conflict(self):
        self._as(self.admin)
        self.client.post(f'{self.url}archive/')
        response = self.client.post(f'{self.url}archive/')
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_archive_is_audited(self):
        self._as(self.admin)
        self.client.post(f'{self.url}archive/')
        entry = AuditLog.objects.get(model_name='client', object_id=str(self.client_obj.pk))
        self.assertEqual(entry.user, self.admin)
        self.assertEqual(entry.extra_data['operation'], 'archive')
        self.assertEqual(entry.extra_data['users_unassigned'], 2)

    def test_unarchive_reactivates_without_restoring_assignments(self):
        self._as(self.admin)
        self.client.post(f'{self.url}archive/')
        response = self.client.post(f'{self.url}unarchive/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client_obj.refresh_from_db()
        self.assertTrue(self.client_obj.is_active)
        self.assertFalse(self.member.profile.clients.exists())
        self.assertTrue(AuditLog.objects.filter(
            model_name='client', object_id=str(self.client_obj.pk),
            extra_data__operation='unarchive',
        ).exists())

    def test_unarchive_of_an_active_client_is_a_conflict(self):
        self._as(self.admin)
        response = self.client.post(f'{self.url}unarchive/')
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_unarchive_is_superuser_only(self):
        self._archive()
        self._as(self.staff)
        response = self.client.post(f'{self.url}unarchive/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_generic_update_cannot_toggle_is_active(self):
        self._as(self.admin)
        response = self.client.patch(self.url, {'is_active': False, 'name': 'Acme 2'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client_obj.refresh_from_db()
        self.assertEqual(self.client_obj.name, 'Acme 2')
        self.assertTrue(self.client_obj.is_active)

    # --- lifecycle info ------------------------------------------------
    def test_lifecycle_is_superuser_only(self):
        for user in (self.staff, self.member):
            self._as(user)
            response = self.client.get(f'{self.url}lifecycle/')
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, user.username)

    def test_lifecycle_reports_records_activity_and_blockers(self):
        OvertimeLog.objects.create(
            user=self.member, client=self.client_obj, date=date(2026, 3, 1), hours=2,
        )
        standby = StandbyLog.objects.create(user=self.member, date=date(2026, 5, 4), hours=8)
        standby.clients.add(self.client_obj)
        Folder.objects.create(client=self.client_obj, name='Contracts')
        self._as(self.admin)
        data = self.client.get(f'{self.url}lifecycle/').data
        self.assertTrue(data['is_active'])
        self.assertEqual(data['assigned_users'], 2)
        self.assertEqual(data['counts'], {'overtime_logs': 1, 'standby_logs': 1})
        self.assertEqual(data['cascade_counts'], {'onboarding_folders': 1})
        self.assertEqual(data['last_activity'], '2026-05-04')
        self.assertFalse(data['can_delete'])
        self.assertTrue(any('archived' in b for b in data['blockers']))
        self.assertTrue(any('overtime_logs' in b for b in data['blockers']))
        self.assertTrue(any('onboarding_folders' in b for b in data['blockers']))

    def test_lifecycle_of_an_empty_archived_client_can_be_deleted(self):
        self._archive()
        self._as(self.admin)
        data = self.client.get(f'{self.url}lifecycle/').data
        self.assertIsNone(data['last_activity'])
        self.assertTrue(data['can_delete'])
        self.assertEqual(data['blockers'], [])

    # --- delete gates ---------------------------------------------------
    def test_delete_is_superuser_only(self):
        self._archive()
        self._as(self.staff)
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Client.objects.filter(pk=self.client_obj.pk).exists())

    def test_delete_of_an_active_client_is_blocked(self):
        self._as(self.admin)
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(any('archived' in b for b in response.data['blockers']))
        self.assertTrue(Client.objects.filter(pk=self.client_obj.pk).exists())

    def test_delete_is_blocked_while_onboarding_data_exists(self):
        self._archive()
        Folder.objects.create(client=self.client_obj, name='Contracts')
        self._as(self.admin)
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['cascade_counts'], {'onboarding_folders': 1})
        self.assertEqual(Folder.objects.count(), 1)

    def test_delete_of_an_empty_archived_client_succeeds_and_is_audited(self):
        self._archive()
        self._as(self.admin)
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Client.objects.filter(pk=self.client_obj.pk).exists())
        self.assertTrue(AuditLog.objects.filter(
            model_name='client', object_id=str(self.client_obj.pk),
            action='DELETE',
        ).exists())
