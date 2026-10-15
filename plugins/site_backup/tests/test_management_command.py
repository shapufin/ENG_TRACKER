"""PERF-12: the POST backup stays synchronous; a CLI command covers large MEDIA_ROOTs."""
import tempfile
from io import StringIO

from django.contrib.auth.models import User
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from plugins.site_backup.models import BackupRecord


class CreateSiteBackupCommandTests(TestCase):
    def test_command_creates_the_same_record_as_the_api(self):
        out = StringIO()
        with tempfile.TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            call_command('create_site_backup', '--note', 'nightly', stdout=out)
            record = BackupRecord.objects.get()
            self.assertEqual(record.note, 'nightly')
            self.assertIsNone(record.created_by)
            self.assertEqual(len(record.checksum), 64)
            self.assertIn(record.filename, out.getvalue())

    def test_no_media_flag_skips_media(self):
        with tempfile.TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            call_command('create_site_backup', '--no-media', stdout=StringIO())
            self.assertEqual(BackupRecord.objects.get().media_file_count, 0)

    def test_user_option_attributes_the_backup(self):
        User.objects.create_user(username='ops', password='x', is_superuser=True)
        with tempfile.TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            call_command('create_site_backup', '--user', 'ops', stdout=StringIO())
            self.assertEqual(BackupRecord.objects.get().created_by.username, 'ops')

    def test_unknown_user_is_a_clean_error(self):
        with self.assertRaises(CommandError):
            call_command('create_site_backup', '--user', 'nobody', stdout=StringIO())
