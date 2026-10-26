"""Purging an archived client's onboarding data, only after a fresh export (plan A4).

Purge removes folders, documents and their files; the client and every record stay.
"""
import os
import tempfile
from datetime import timedelta

from django.contrib.auth.models import User
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.overtime.models.core import Client, OvertimeLog
from apps.reports.models import AuditLog
from core.utils.timezone_local import business_today

from .models import ClientExport, Document, Folder

BASE = '/api/plugins/onboarding'


class PurgeTestCase(APITestCase):
    def setUp(self):
        cache.clear()
        call_command('seed_plugin_permissions')
        media = tempfile.TemporaryDirectory()
        self.addCleanup(media.cleanup)
        override = override_settings(MEDIA_ROOT=media.name)
        override.enable()
        self.addCleanup(override.disable)

        self.admin = User.objects.create_superuser(username='pg_admin', password='x')
        self.staff = User.objects.create_user(username='pg_staff', password='x', is_staff=True)
        self.old = Client.objects.create(name='Old', code='OLD', is_active=False)
        self.folder = Folder.objects.create(client=self.old, name='Contracts')
        self.docs = [
            Document.objects.create(
                client=self.old, folder=self.folder if i else None, name=f'd{i}.pdf', size_bytes=4,
                uploaded_by=self.admin,
                file=SimpleUploadedFile(f'd{i}.pdf', b'data', content_type='application/pdf'),
            )
            for i in range(2)
        ]
        self.url = f'{BASE}/clients/{self.old.pk}/purge/'
        self.client.force_authenticate(self.admin)

    def _export(self, **overrides):
        values = dict(
            client=self.old, client_code='OLD', client_name='Old', kind='client', requested_by=self.admin,
            status='ready', folders=1, documents=2, completed_at=timezone.now(),
            expires_at=timezone.now() + timedelta(hours=23),
        )
        values.update(overrides)
        return ClientExport.objects.create(**values)

    def _log(self, days_ago):
        return OvertimeLog.objects.create(
            user=self.admin, client=self.old, date=business_today() - timedelta(days=days_ago), hours=2,
        )

    def _purge(self, code='OLD'):
        return self.client.post(self.url, {'confirm_code': code}, format='json')


class PurgeGateTests(PurgeTestCase):
    def test_purge_is_superuser_only(self):
        self._export()
        self.client.force_authenticate(self.staff)
        self.assertEqual(self._purge().status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(Document.objects.count(), 2)

    def test_the_client_must_be_archived(self):
        self._export()
        self.old.is_active = True
        self.old.save(update_fields=['is_active'])
        response = self._purge()
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(any('archived' in b for b in response.data['blockers']))
        self.assertEqual(Document.objects.count(), 2)

    def test_recent_activity_blocks_the_purge(self):
        self._export()
        self._log(days_ago=30)
        response = self._purge()
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(any('12 months' in b for b in response.data['blockers']))

    def test_activity_older_than_a_year_does_not_block(self):
        self._export()
        self._log(days_ago=400)
        self.assertEqual(self._purge().status_code, status.HTTP_200_OK)

    def test_an_export_is_required(self):
        response = self._purge()
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(any('export' in b.lower() for b in response.data['blockers']))
        self.assertEqual(Document.objects.count(), 2)

    def test_a_stale_export_does_not_count(self):
        self._export(completed_at=timezone.now() - timedelta(hours=25))
        self.assertEqual(self._purge().status_code, status.HTTP_409_CONFLICT)

    def test_a_failed_or_other_clients_export_does_not_count(self):
        self._export(status='failed')
        other = Client.objects.create(name='Other', code='OTH')
        self._export(client=other, client_code='OTH')
        self._export(kind='all', client=None)
        self.assertEqual(self._purge().status_code, status.HTTP_409_CONFLICT)

    def test_data_added_after_the_export_blocks_the_purge(self):
        self._export()
        Document.objects.create(
            client=self.old, name='late.pdf', size_bytes=4, uploaded_by=self.admin,
            file=SimpleUploadedFile('late.pdf', b'data', content_type='application/pdf'),
        )
        response = self._purge()
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(any('changed after' in b for b in response.data['blockers']))
        self.assertEqual(Document.objects.count(), 3)

    def test_the_typed_code_must_match(self):
        self._export()
        for wrong in ('', 'old', 'OTHER'):
            self.assertEqual(self._purge(wrong).status_code, status.HTTP_400_BAD_REQUEST, wrong)
        self.assertEqual(Document.objects.count(), 2)


class PurgeEffectTests(PurgeTestCase):
    def test_purge_removes_onboarding_data_and_files_but_keeps_the_client_and_records(self):
        self._export()
        log = self._log(days_ago=500)
        paths = [d.file.path for d in self.docs]
        with self.captureOnCommitCallbacks(execute=True):
            response = self._purge()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual((response.data['folders'], response.data['documents']), (1, 2))
        self.assertFalse(Document.objects.filter(client=self.old).exists())
        self.assertFalse(Folder.objects.filter(client=self.old).exists())
        self.assertTrue(all(not os.path.exists(p) for p in paths))
        self.assertTrue(Client.objects.filter(pk=self.old.pk).exists())
        self.assertTrue(OvertimeLog.objects.filter(pk=log.pk).exists())

    def test_purge_is_audited(self):
        self._export()
        self._purge()
        entry = AuditLog.objects.get(model_name='client', extra_data__operation='purge_onboarding')
        self.assertEqual(entry.user, self.admin)
        self.assertEqual(entry.extra_data['documents'], 2)

    def test_after_a_purge_an_empty_client_can_be_deleted(self):
        self._export()
        self._purge()
        data = self.client.get(f'/api/overtime/clients/{self.old.pk}/lifecycle/').data
        self.assertTrue(data['can_delete'], data['blockers'])


class LifecycleInfoTests(PurgeTestCase):
    def test_lifecycle_is_superuser_only(self):
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get(f'{BASE}/clients/{self.old.pk}/lifecycle/').status_code, 403)

    def test_lifecycle_reports_blockers_and_the_latest_usable_export(self):
        url = f'{BASE}/clients/{self.old.pk}/lifecycle/'
        blocked = self.client.get(url).data
        self.assertFalse(blocked['can_purge'])
        self.assertIsNone(blocked['latest_export'])
        export = self._export()
        ready = self.client.get(url).data
        self.assertTrue(ready['can_purge'], ready['blockers'])
        self.assertEqual(ready['latest_export']['id'], export.pk)
        self.assertEqual(ready['documents'], 2)
