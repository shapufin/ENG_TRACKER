"""Backup encryption, closed-year refusal and privilege-change confirmation
(audit 2026-11-13, workflow-invariants item 80)."""
import io
import tempfile
import zipfile
from datetime import date

from django.contrib.auth.models import User
from django.test import TestCase, override_settings

from apps.overtime.models import Client, OvertimeLog
from apps.users.services.approval_periods import clear_closed_year_cache, close_year
from plugins.site_backup.services import backup as backup_service
from plugins.site_backup.services import encryption
from plugins.site_backup.services import restore as restore_service
from plugins.site_backup.services.archive import ArchiveError, open_archive

KEY_A = 'QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUE='
KEY_B = 'QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkI='


class _MediaMixin:
    def _media(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        override = override_settings(MEDIA_ROOT=tmp.name, BACKUP_ENCRYPTION_KEYS=[KEY_A])
        override.enable()
        self.addCleanup(override.disable)


class BackupEncryptionTests(_MediaMixin, TestCase):
    def setUp(self):
        self._media()
        self.user = User.objects.create_user(username='enc_admin', password='x', is_superuser=True)

    def _record(self):
        return backup_service.create_backup(self.user, include_media=False)

    def test_stored_backup_is_ciphertext_not_a_zip(self):
        record = self._record()
        self.assertTrue(record.filename.endswith('.zip.enc'))
        with record.file.open('rb') as fh:
            raw = fh.read()
        self.assertTrue(raw.startswith(encryption.MAGIC))
        self.assertFalse(zipfile.is_zipfile(io.BytesIO(raw)))
        self.assertNotIn(b'enc_admin', raw)
        self.assertNotIn(b'manifest.json', raw)

    def test_round_trip_opens_and_previews(self):
        record = self._record()
        with record.file.open('rb') as fh:
            result = restore_service.preview(fh)
        self.assertTrue(result['schema_compatible'])

    def test_wrong_key_fails_closed(self):
        record = self._record()
        with override_settings(BACKUP_ENCRYPTION_KEYS=[KEY_B]):
            with record.file.open('rb') as fh:
                with self.assertRaises(ArchiveError):
                    open_archive(fh)

    def test_rotation_old_key_still_decrypts(self):
        record = self._record()
        with override_settings(BACKUP_ENCRYPTION_KEYS=[KEY_B, KEY_A]):
            with record.file.open('rb') as fh:
                self.assertIn('manifest.json', open_archive(fh).namelist())

    def test_tampered_or_truncated_file_is_rejected(self):
        record = self._record()
        with record.file.open('rb') as fh:
            raw = bytearray(fh.read())
        flipped = bytearray(raw)
        flipped[len(raw) // 2] ^= 0x01
        with self.assertRaises(ArchiveError):
            open_archive(io.BytesIO(bytes(flipped)))
        with self.assertRaises(ArchiveError):
            open_archive(io.BytesIO(bytes(raw[:-20])))

    def test_plain_zip_from_before_encryption_still_opens(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w') as zf:
            zf.writestr('manifest.json', '{}')
        buf.seek(0)
        self.assertIn('manifest.json', open_archive(buf).namelist())

    def test_multi_chunk_file_round_trips(self):
        data = bytes(range(256)) * (encryption.CHUNK_SIZE // 128)  # 2 full chunks
        with tempfile.TemporaryDirectory() as tmp:
            src, dst = f'{tmp}/a.bin', f'{tmp}/a.enc'
            with open(src, 'wb') as fh:
                fh.write(data)
            encryption.encrypt_file(src, dst)
            with open(dst, 'rb') as fh:
                self.assertEqual(encryption.decrypt_to_tempfile(fh).read(), data)


class RestoreRefusesClosedYearTests(_MediaMixin, TestCase):
    def setUp(self):
        self._media()
        clear_closed_year_cache()
        self.addCleanup(clear_closed_year_cache)
        self.user = User.objects.create_user(username='cy_admin', password='x', is_superuser=True)
        self.client_row = Client.objects.create(name='C', code='C1')
        self.log = OvertimeLog.objects.create(
            user=self.user, client=self.client_row, date=date(2020, 3, 2), hours=2, status='approved',
        )
        self.record = backup_service.create_backup(self.user, include_media=False)
        self.log.hours = 5
        self.log.save()

    def _commit(self):
        with self.record.file.open('rb') as fh:
            return restore_service.commit(
                fh, approved_models=['overtime.overtimelog'], confirmed=True, user=self.user,
            )

    def test_open_year_restore_is_allowed(self):
        self._commit()
        self.log.refresh_from_db()
        self.assertEqual(self.log.hours, 2)

    def test_closed_year_restore_is_refused_and_preview_flags_it(self):
        close_year(2020)
        with self.record.file.open('rb') as fh:
            preview = restore_service.preview(fh)
        self.assertEqual(preview['closed_year_conflicts'], {'overtime.overtimelog': [2020]})
        with self.assertRaisesMessage(restore_service.RestoreError, 'closed year'):
            self._commit()
        self.log.refresh_from_db()
        self.assertEqual(self.log.hours, 5)


class RestorePrivilegeConfirmationTests(_MediaMixin, TestCase):
    def setUp(self):
        self._media()
        self.admin = User.objects.create_user(
            username='priv_admin', password='x', is_superuser=True, is_staff=True,
        )
        self.record = backup_service.create_backup(self.admin, include_media=False)
        self.admin.is_superuser = False
        self.admin.save()

    def _commit(self, **kwargs):
        with self.record.file.open('rb') as fh:
            return restore_service.commit(
                fh, approved_models=['auth.user'], confirmed=True, user=self.admin, **kwargs,
            )

    def test_preview_lists_privilege_changes_without_password_values(self):
        with self.record.file.open('rb') as fh:
            changes = restore_service.preview(fh)['privilege_changes']
        superuser = [c for c in changes if c['field'] == 'is_superuser']
        self.assertEqual(len(superuser), 1)
        self.assertEqual((superuser[0]['from'], superuser[0]['to']), (False, True))
        self.assertTrue(all(c['field'] != 'password' or c['to'] == 'changed' for c in changes))

    def test_commit_refuses_without_privilege_confirmation(self):
        with self.assertRaisesMessage(restore_service.RestoreError, 'confirm'):
            self._commit()
        self.admin.refresh_from_db()
        self.assertFalse(self.admin.is_superuser)

    def test_commit_with_confirmation_restores(self):
        result = self._commit(confirm_privilege_changes=True)
        self.assertGreaterEqual(result['privilege_changes'], 1)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_superuser)
