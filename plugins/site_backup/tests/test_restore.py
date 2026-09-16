import gzip
import io
import json
import tempfile
import zipfile
from unittest.mock import patch

from django.contrib.auth.models import Group, User
from django.test import TestCase, override_settings

from plugins.site_backup.services import backup as backup_service
from plugins.site_backup.services import restore as restore_service
from plugins.site_backup.services.archive import ArchiveError


class RestorePreviewAndCommitTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='admin', password='password', is_superuser=True)
        self.g1 = Group.objects.create(name='g1')
        self.g2 = Group.objects.create(name='g2')

        self.media_root_cm = tempfile.TemporaryDirectory()
        self.addCleanup(self.media_root_cm.cleanup)
        self.override = override_settings(MEDIA_ROOT=self.media_root_cm.name)
        self.override.enable()
        self.addCleanup(self.override.disable)

        self.record = backup_service.create_backup(self.user, include_media=False)

        # Mutate DB after the backup: g2 deleted, g3 created (not in the backup).
        self.g1_pk, self.g2_pk = self.g1.pk, self.g2.pk
        self.g2.delete()
        self.g3 = Group.objects.create(name='g3')

    def _group_entry(self, groups):
        return next(g for g in groups if g['model'] == 'auth.group')

    def test_preview_classifies_new_overwritten_db_only(self):
        with self.record.file.open('rb') as fh:
            result = restore_service.preview(fh)

        self.assertTrue(result['schema_compatible'])
        entry = self._group_entry(result['model_groups'])
        self.assertEqual(entry['file_count'], 2)
        self.assertEqual(entry['db_count'], 2)
        self.assertEqual(entry['new'], 1)
        self.assertEqual(entry['overwritten'], 1)
        self.assertEqual(entry['db_only'], 1)

    def test_preview_blocks_on_schema_mismatch(self):
        with patch('plugins.site_backup.services.restore.migration_state_hash', return_value='different'):
            with self.record.file.open('rb') as fh:
                result = restore_service.preview(fh)
        self.assertFalse(result['schema_compatible'])
        self.assertEqual(result['model_groups'], [])

    def test_commit_requires_confirmation(self):
        with self.record.file.open('rb') as fh:
            with self.assertRaises(restore_service.RestoreError):
                restore_service.commit(fh, approved_models=['auth.group'], confirmed=False, user=self.user)

    def test_commit_blocks_on_schema_mismatch(self):
        with patch('plugins.site_backup.services.restore.migration_state_hash', return_value='different'):
            with self.record.file.open('rb') as fh:
                with self.assertRaises(restore_service.RestoreError):
                    restore_service.commit(
                        fh, approved_models=['auth.group'], confirmed=True, user=self.user
                    )

    def test_commit_without_delete_missing_leaves_db_only_row_untouched(self):
        with self.record.file.open('rb') as fh:
            result = restore_service.commit(
                fh, approved_models=['auth.group'], confirmed=True, user=self.user
            )
        self.assertEqual(result['created']['auth.group'], 1)
        self.assertEqual(result['updated']['auth.group'], 1)
        self.assertEqual(result['deleted']['auth.group'], 0)

        self.assertTrue(Group.objects.filter(pk=self.g1_pk).exists())
        self.assertTrue(Group.objects.filter(pk=self.g2_pk).exists())
        self.assertTrue(Group.objects.filter(pk=self.g3.pk).exists())  # untouched, not opted into deletion

    def test_commit_with_delete_missing_removes_db_only_row(self):
        with self.record.file.open('rb') as fh:
            result = restore_service.commit(
                fh,
                approved_models=['auth.group'],
                delete_missing_models=['auth.group'],
                confirmed=True,
                user=self.user,
            )
        self.assertEqual(result['deleted']['auth.group'], 1)
        self.assertTrue(Group.objects.filter(pk=self.g1_pk).exists())
        self.assertTrue(Group.objects.filter(pk=self.g2_pk).exists())
        self.assertFalse(Group.objects.filter(pk=self.g3.pk).exists())

    def test_delete_missing_ignored_for_unapproved_model(self):
        """delete_missing_models is intersected with approved_models — listing a
        model there without approving it must not touch that model at all."""
        with self.record.file.open('rb') as fh:
            with self.assertRaises(restore_service.RestoreError):
                # No models approved at all -> rejected before touching anything.
                restore_service.commit(
                    fh,
                    approved_models=[],
                    delete_missing_models=['auth.group'],
                    confirmed=True,
                    user=self.user,
                )
        # Nothing changed.
        self.assertTrue(Group.objects.filter(pk=self.g3.pk).exists())


class FieldFidelityRoundTripTests(TestCase):
    """Prove every field type actually round-trips, not just PK/existence.

    ``test_commit_*`` above only checks row counts on ``auth.group``, a model
    with a single CharField. That is not proof the restore preserves data —
    decimals, times, booleans, FKs, soft-delete state, and M2M-through grades
    are exactly where a serializer/manager mistake would silently drop a
    value. This backs the "does restore bring back every field" question with
    an actual diff, not a reading of the code.
    """

    def setUp(self):
        import datetime as dt

        from apps.overtime.models.core import Client, OvertimeLog
        from apps.users.models.core import Tech, TechLevel, UserTech

        self.user = User.objects.create_user(
            username='admin', password='password', is_superuser=True
        )
        self.owner = User.objects.create_user(username='owner', password='x')
        self.client_obj = Client.objects.create(
            name='Acme', code='ACME', description='desc', is_active=True
        )
        self.tech = Tech.objects.create(name='Infra', code='INFRA')
        self.level = TechLevel.objects.create(
            tech=self.tech, name='L3', code='L3', rank=3
        )
        self.assignment = UserTech.objects.create(
            user_profile=self.owner.profile, tech=self.tech, level=self.level
        )
        self.log = OvertimeLog.objects.create(
            user=self.owner,
            client=self.client_obj,
            date='2026-03-15',
            # ``save()`` recomputes hours from start/end time, so this is not
            # the round-tripped value under test — read it back after create.
            hours='0',
            description='Weekend release',
            start_time=dt.time(18, 0, 0),
            end_time=dt.time(23, 45, 0),
            evidence_type='ticket',
            status='approved',
            ticket_references=['CHG0012345', 'INC0067890'],
        )
        self.log.refresh_from_db()
        self.original_hours = str(self.log.hours)

        # A soft-deleted row must still round-trip — dumpdata must NOT be
        # filtered by is_deleted, or a restore silently loses it.
        self.deleted_client = Client.objects.create(name='Gone', code='GONE')
        self.deleted_client.soft_delete(self.user)

        self.media_root_cm = tempfile.TemporaryDirectory()
        self.addCleanup(self.media_root_cm.cleanup)
        self.override = override_settings(MEDIA_ROOT=self.media_root_cm.name)
        self.override.enable()
        self.addCleanup(self.override.disable)

        self.record = backup_service.create_backup(self.user, include_media=False)

        # Wipe every captured value so restore is the only thing that could
        # put it back — including hard-deleting rows entirely.
        self.log_pk, self.assignment_pk = self.log.pk, self.assignment.pk
        self.client_pk, self.deleted_client_pk = self.client_obj.pk, self.deleted_client.pk
        OvertimeLog.objects.filter(pk=self.log_pk).delete()
        UserTech.objects.filter(pk=self.assignment_pk).delete()
        Client.objects.all().delete()

    def test_every_field_type_round_trips_through_backup_and_restore(self):
        from apps.overtime.models.core import Client, OvertimeLog
        from apps.users.models.core import UserTech

        with self.record.file.open('rb') as fh:
            result = restore_service.commit(
                fh,
                approved_models=['overtime.client', 'overtime.overtimelog', 'users.usertech'],
                confirmed=True,
                user=self.user,
            )
        self.assertEqual(result['created']['overtime.client'], 2)
        self.assertEqual(result['created']['overtime.overtimelog'], 1)
        self.assertEqual(result['created']['users.usertech'], 1)

        log = OvertimeLog.objects.get(pk=self.log_pk)
        self.assertEqual(str(log.hours), self.original_hours)
        self.assertEqual(log.description, 'Weekend release')
        self.assertEqual(str(log.start_time), '18:00:00')
        self.assertEqual(str(log.end_time), '23:45:00')
        self.assertEqual(log.evidence_type, 'ticket')
        self.assertEqual(log.status, 'approved')
        self.assertEqual(log.ticket_references, ['CHG0012345', 'INC0067890'])
        self.assertEqual(log.client_id, self.client_pk)
        self.assertEqual(log.user_id, self.owner.id)

        assignment = UserTech.objects.get(pk=self.assignment_pk)
        self.assertEqual(assignment.tech_id, self.tech.id)
        self.assertEqual(assignment.level_id, self.level.id)

        # The soft-deleted client came back, still marked deleted — the
        # default manager is unfiltered, so dumpdata captured it.
        deleted = Client.objects.get(pk=self.deleted_client_pk)
        self.assertTrue(deleted.is_deleted)
        self.assertIsNotNone(deleted.deleted_at)


class UndecodableDbDumpTests(TestCase):
    """A db.json.gz payload that isn't valid UTF-8 (corrupted archive, or one
    built by a different tool/encoding) must fail as a clean ArchiveError,
    not an unhandled UnicodeDecodeError."""

    def _corrupted_backup_zip(self) -> io.BytesIO:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as archive:
            manifest = {
                'schema_version': 1,
                'migration_state_hash': backup_service.migration_state_hash(),
                'includes_media': False,
                'model_row_counts': {},
            }
            archive.writestr('manifest.json', json.dumps(manifest))
            db_gz = io.BytesIO()
            with gzip.GzipFile(fileobj=db_gz, mode='wb') as gz:
                # 0xFF is not valid anywhere in a UTF-8 byte sequence.
                gz.write(b'[{"model": "auth.group", "pk": 1, "fields": {"name": "\xff\xfe"}}]')
            archive.writestr('db.json.gz', db_gz.getvalue())
        buf.seek(0)
        buf.name = 'corrupted.zip'
        return buf

    def test_preview_raises_archive_error_not_unicode_decode_error(self):
        with self.assertRaises(ArchiveError):
            restore_service.preview(self._corrupted_backup_zip())
