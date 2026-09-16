import gzip
import json
import tempfile
import zipfile

from django.contrib.auth.models import User
from django.test import TestCase, override_settings

from plugins.site_backup.models import BackupRecord
from plugins.site_backup.services import backup as backup_service


class CreateBackupTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='admin', password='password', is_superuser=True)

    def test_create_backup_produces_valid_archive_with_manifest(self):
        with tempfile.TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            record = backup_service.create_backup(self.user, note='pre-release', include_media=True)

            self.assertEqual(BackupRecord.objects.count(), 1)
            self.assertTrue(record.checksum)
            self.assertEqual(len(record.checksum), 64)
            self.assertGreater(record.size_bytes, 0)
            self.assertEqual(record.note, 'pre-release')
            self.assertEqual(record.created_by, self.user)

            with record.file.open('rb') as fh:
                with zipfile.ZipFile(fh) as archive:
                    names = archive.namelist()
                    self.assertIn('manifest.json', names)
                    self.assertIn('db.json.gz', names)

                    manifest = json.loads(archive.read('manifest.json'))
                    self.assertEqual(manifest['schema_version'], backup_service.MANIFEST_SCHEMA_VERSION)
                    self.assertEqual(manifest['migration_state_hash'], record.migration_state_hash)
                    self.assertTrue(manifest['includes_media'])
                    self.assertIn('auth.user', manifest['model_row_counts'])

                    with gzip.GzipFile(fileobj=archive.open('db.json.gz')) as gz:
                        dumped = json.loads(gz.read().decode('utf-8'))
                    self.assertTrue(any(row['model'] == 'auth.user' for row in dumped))
                    # excluded apps never appear in the fixture
                    self.assertFalse(any(row['model'].startswith('sessions.') for row in dumped))
                    self.assertFalse(any(row['model'].startswith('site_backup.') for row in dumped))

    def test_create_backup_without_media_skips_media_files(self):
        with tempfile.TemporaryDirectory() as media_root:
            with override_settings(MEDIA_ROOT=media_root):
                record = backup_service.create_backup(self.user, include_media=False)
        self.assertEqual(record.media_file_count, 0)

    def test_migration_state_hash_is_stable_across_calls(self):
        self.assertEqual(backup_service.migration_state_hash(), backup_service.migration_state_hash())

    def test_dumpable_model_labels_excludes_sessions_and_self(self):
        labels = backup_service.dumpable_model_labels()
        self.assertFalse(any(label.startswith('sessions.') for label in labels))
        self.assertFalse(any(label.startswith('site_backup.') for label in labels))
        self.assertIn('auth.user', labels)
