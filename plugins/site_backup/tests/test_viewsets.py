import gzip
import io
import json
import tempfile
import zipfile

from django.contrib.auth.models import Group, User
from django.test import TestCase, override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.plugins.models import Plugin
from plugins.site_backup.models import BackupRecord
from plugins.site_backup.services import backup as backup_service
from plugins.site_backup.viewsets import BackupRecordViewSet, RestoreViewSet

BASE = '/api/plugins/site_backup'


def call(view_cls, method_map, path, user, data=None, fmt='multipart', **kwargs):
    factory = APIRequestFactory()
    http_method = next(iter(method_map))
    if http_method == 'get':
        request = factory.get(path, data or {})
    elif http_method == 'delete':
        request = factory.delete(path)
    else:
        request = factory.post(path, data or {}, format=fmt)
    force_authenticate(request, user=user)
    return view_cls.as_view(method_map)(request, **kwargs)


class AuthorityTests(TestCase):
    """Site backup/restore is hard-gated to superusers only, unlike the usual
    staff-or-plugin-manage-grant pattern — a full restore can overwrite or
    delete any row, so plain staff (even with an explicit 'manage' grant)
    must still be denied.
    """

    def setUp(self):
        self.staff = User.objects.create_user(username='staff', password='x', is_staff=True)
        self.superuser = User.objects.create_user(username='root', password='x', is_superuser=True)

    def test_staff_without_superuser_is_denied_list(self):
        response = call(BackupRecordViewSet, {'get': 'list'}, f'{BASE}/backups/', self.staff)
        self.assertEqual(response.status_code, 403)

    def test_staff_without_superuser_is_denied_create(self):
        response = call(BackupRecordViewSet, {'post': 'create'}, f'{BASE}/backups/', self.staff, data={})
        self.assertEqual(response.status_code, 403)

    def test_staff_without_superuser_is_denied_restore_preview(self):
        response = call(
            RestoreViewSet, {'post': 'preview'}, f'{BASE}/restore/preview/', self.staff, data={'backup_id': 1}
        )
        self.assertEqual(response.status_code, 403)

    def test_superuser_can_list_backups(self):
        response = call(BackupRecordViewSet, {'get': 'list'}, f'{BASE}/backups/', self.superuser)
        self.assertEqual(response.status_code, 200)


class CreateBackupViewTests(TestCase):
    def setUp(self):
        self.superuser = User.objects.create_user(username='root', password='x', is_superuser=True)
        self.media_root_cm = tempfile.TemporaryDirectory()
        self.addCleanup(self.media_root_cm.cleanup)
        self.override = override_settings(MEDIA_ROOT=self.media_root_cm.name)
        self.override.enable()
        self.addCleanup(self.override.disable)

    def test_create_backup_via_view(self):
        response = call(
            BackupRecordViewSet, {'post': 'create'}, f'{BASE}/backups/', self.superuser,
            data={'note': 'manual', 'include_media': 'false'}, fmt='multipart',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(BackupRecord.objects.count(), 1)
        self.assertEqual(response.data['note'], 'manual')


class UploadSizeLimitTests(TestCase):
    def setUp(self):
        self.superuser = User.objects.create_user(username='root', password='x', is_superuser=True)
        Plugin.objects.update_or_create(
            name='site_backup', defaults={'config': {'max_upload_size_mb': 1}, 'verbose_name': 'x', 'version': '1'}
        )

    def _oversized_file(self):
        buf = io.BytesIO(b'0' * (2 * 1024 * 1024))
        buf.name = 'backup.zip'
        return buf

    def test_restore_preview_rejects_oversized_upload(self):
        response = call(
            RestoreViewSet, {'post': 'preview'}, f'{BASE}/restore/preview/', self.superuser,
            data={'file': self._oversized_file()},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('maximum upload size', str(response.data))


class CorruptedArchiveTests(TestCase):
    """A backup whose db.json.gz can't be decoded as UTF-8 must return a clean
    400 error envelope, not an unhandled 500 UnicodeDecodeError."""

    def setUp(self):
        self.superuser = User.objects.create_user(username='root', password='x', is_superuser=True)

    def _corrupted_backup_file(self):
        from plugins.site_backup.services.backup import migration_state_hash

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as archive:
            manifest = {
                'schema_version': 1,
                'migration_state_hash': migration_state_hash(),
                'includes_media': False,
                'model_row_counts': {},
            }
            archive.writestr('manifest.json', json.dumps(manifest))
            db_gz = io.BytesIO()
            with gzip.GzipFile(fileobj=db_gz, mode='wb') as gz:
                gz.write(b'[{"model": "auth.group", "pk": 1, "fields": {"name": "\xff\xfe"}}]')
            archive.writestr('db.json.gz', db_gz.getvalue())
        buf.seek(0)
        buf.name = 'corrupted.zip'
        return buf

    def test_restore_preview_returns_clean_400_for_corrupted_archive(self):
        response = call(
            RestoreViewSet, {'post': 'preview'}, f'{BASE}/restore/preview/', self.superuser,
            data={'file': self._corrupted_backup_file()},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.data)
        self.assertIn('encoding', str(response.data).lower())


class RestoreEndToEndTests(TestCase):
    def setUp(self):
        self.superuser = User.objects.create_user(username='root', password='x', is_superuser=True)
        self.g1 = Group.objects.create(name='g1')

        self.media_root_cm = tempfile.TemporaryDirectory()
        self.addCleanup(self.media_root_cm.cleanup)
        self.override = override_settings(MEDIA_ROOT=self.media_root_cm.name)
        self.override.enable()
        self.addCleanup(self.override.disable)

        self.record = backup_service.create_backup(self.superuser, include_media=False)

    def test_preview_then_commit_via_views(self):
        preview_response = call(
            RestoreViewSet, {'post': 'preview'}, f'{BASE}/restore/preview/', self.superuser,
            data={'backup_id': self.record.pk},
        )
        self.assertEqual(preview_response.status_code, 200)
        self.assertTrue(preview_response.data['schema_compatible'])

        commit_response = call(
            RestoreViewSet, {'post': 'commit'}, f'{BASE}/restore/commit/', self.superuser,
            data={
                'backup_id': self.record.pk,
                'approved_models': ['auth.group'],
                'confirmed': 'true',
            },
        )
        self.assertEqual(commit_response.status_code, 200)
        self.assertEqual(commit_response.data['updated']['auth.group'], 1)

    def test_commit_without_confirmation_returns_400(self):
        response = call(
            RestoreViewSet, {'post': 'commit'}, f'{BASE}/restore/commit/', self.superuser,
            data={'backup_id': self.record.pk, 'approved_models': ['auth.group']},
        )
        self.assertEqual(response.status_code, 400)
