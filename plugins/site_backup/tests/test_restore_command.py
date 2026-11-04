"""Headless restore: provisioning a new server without booting the web UI."""
import os
import tempfile
from io import StringIO

from django.contrib.auth.models import Group, User
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from plugins.site_backup.services import backup as backup_service


class RestoreSiteBackupCommandTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='admin', password='password', is_superuser=True)
        self.g1 = Group.objects.create(name='g1')
        self.g2 = Group.objects.create(name='g2')
        media_cm = tempfile.TemporaryDirectory()
        self.addCleanup(media_cm.cleanup)
        override = override_settings(MEDIA_ROOT=media_cm.name)
        override.enable()
        self.addCleanup(override.disable)
        record = backup_service.create_backup(self.user, include_media=False)
        self.archive_path = os.path.join(media_cm.name, 'copy.zip')
        with record.file.open('rb') as src, open(self.archive_path, 'wb') as dst:
            dst.write(src.read())
        self.g2.delete()
        self.g3 = Group.objects.create(name='g3')

    def _run(self, *args):
        out = StringIO()
        call_command('restore_site_backup', self.archive_path, *args, stdout=out)
        return out.getvalue()

    def test_all_restores_every_model_in_the_archive(self):
        output = self._run('--all', '--yes')
        self.assertTrue(Group.objects.filter(name='g2').exists())
        self.assertTrue(Group.objects.filter(name='g3').exists(), 'no --delete-missing: g3 stays')
        self.assertIn('auth.group', output)

    def test_delete_missing_removes_rows_absent_from_the_backup(self):
        self._run('--models', 'auth.group', '--delete-missing', '--yes')
        self.assertFalse(Group.objects.filter(name='g3').exists())
        self.assertTrue(Group.objects.filter(name='g2').exists())

    def test_requires_all_or_models(self):
        with self.assertRaises(CommandError):
            self._run('--yes')

    def test_unknown_model_is_a_clean_error(self):
        with self.assertRaises(CommandError):
            self._run('--models', 'nope.model', '--yes')

    def test_missing_file_is_a_clean_error(self):
        with self.assertRaises(CommandError):
            call_command('restore_site_backup', 'does-not-exist.zip', '--all', '--yes', stdout=StringIO())

    def test_declined_prompt_restores_nothing(self):
        from unittest.mock import patch

        with patch('builtins.input', return_value='no'):
            with self.assertRaises(CommandError):
                self._run('--all')
        self.assertFalse(Group.objects.filter(name='g2').exists())

    def test_schema_mismatch_is_blocked(self):
        from unittest.mock import patch

        with patch('plugins.site_backup.services.restore.migration_state_hash', return_value='different'):
            with self.assertRaises(CommandError):
                self._run('--all', '--yes')
