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


class DeleteMissingProtectedRowTests(TestCase):
    """``delete_missing_models`` must turn a PROTECTed row into a clean RestoreError
    (400 for the superuser), not an unhandled ProtectedError (500)."""

    def test_delete_missing_client_with_overtime_is_a_restore_error(self):
        import datetime as dt

        from apps.overtime.models.core import Client, OvertimeLog

        admin = User.objects.create_user(username='admin', password='x', is_superuser=True)
        owner = User.objects.create_user(username='owner', password='x')
        with tempfile.TemporaryDirectory() as media:
            with override_settings(MEDIA_ROOT=media):
                record = backup_service.create_backup(admin, include_media=False)

                client = Client.objects.create(name='Later', code='LATER')
                OvertimeLog.objects.create(
                    user=owner, client=client, date=dt.date(2026, 9, 1), hours=2,
                )

                with record.file.open('rb') as fh:
                    with self.assertRaises(restore_service.RestoreError):
                        restore_service.commit(
                            fh,
                            approved_models=['overtime.client'],
                            delete_missing_models=['overtime.client'],
                            confirmed=True,
                            user=admin,
                        )

        self.assertTrue(Client.objects.filter(pk=client.pk).exists())
        self.assertEqual(OvertimeLog.objects.count(), 1)


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


class NonAsciiRoundTripTests(TestCase):
    """Backups must be UTF-8 whatever the process locale encoding is (R-3)."""

    def test_non_ascii_text_survives_backup_then_preview_under_legacy_locale(self):
        user = User.objects.create_user(
            username='admin', password='password', is_superuser=True,
            first_name='Ëndri Çela —',
        )
        real_open = gzip.open

        def legacy_locale_open(filename, mode='rb', *args, **kwargs):
            # Text mode without an explicit encoding follows the locale
            # (cp1252 on Windows); simulate that.
            if 't' in mode and kwargs.get('encoding') is None:
                kwargs['encoding'] = 'cp1252'
            return real_open(filename, mode, *args, **kwargs)

        with (
            tempfile.TemporaryDirectory() as media_root,
            override_settings(MEDIA_ROOT=media_root),
            patch('gzip.open', legacy_locale_open),
        ):
            record = backup_service.create_backup(user, include_media=False)
            with record.file.open('rb') as fh:
                result = restore_service.preview(fh)
            with record.file.open('rb') as fh, zipfile.ZipFile(fh) as zf:
                dump = gzip.decompress(zf.read('db.json.gz')).decode('utf-8')

        entry = next(g for g in result['model_groups'] if g['model'] == 'auth.user')
        self.assertEqual(entry['file_count'], 1)
        self.assertEqual(entry['overwritten'], 1)
        self.assertIn('Ëndri Çela', dump)


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


class ExtractMediaGuardTests(TestCase):
    """SEC-04: a crafted backup zip must not write outside MEDIA_ROOT or explode."""

    def _zip(self, members):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
            for name, data in members.items():
                zf.writestr(name, data)
        buf.seek(0)
        return zipfile.ZipFile(buf)

    def test_zip_slip_member_is_rejected_and_nothing_is_written(self):
        import os
        with tempfile.TemporaryDirectory() as tmp:
            media = os.path.join(tmp, 'media')
            os.makedirs(media)
            archive = self._zip({
                'media/ok.txt': b'fine',
                'media/../../evil.txt': b'pwned',
            })
            with override_settings(MEDIA_ROOT=media):
                with self.assertRaises(restore_service.RestoreError):
                    restore_service._extract_media(archive)
            self.assertFalse(os.path.exists(os.path.join(tmp, 'evil.txt')))
            self.assertFalse(os.path.exists(os.path.join(media, 'ok.txt')))

    def test_absolute_member_path_is_rejected(self):
        import os
        with tempfile.TemporaryDirectory() as tmp:
            media = os.path.join(tmp, 'media')
            os.makedirs(media)
            outside = os.path.join(tmp, 'abs.txt')
            archive = self._zip({'media//' + outside.replace(chr(92), '/'): b'x'})
            with override_settings(MEDIA_ROOT=media):
                with self.assertRaises(restore_service.RestoreError):
                    restore_service._extract_media(archive)
            self.assertFalse(os.path.exists(outside))

    def test_total_uncompressed_size_over_cap_is_rejected(self):
        import os
        with tempfile.TemporaryDirectory() as tmp:
            archive = self._zip({'media/a.bin': b'0' * 600, 'media/b.bin': b'0' * 600})
            with override_settings(MEDIA_ROOT=tmp):
                with patch.object(restore_service, 'MAX_MEDIA_UNCOMPRESSED_BYTES', 1000):
                    with self.assertRaises(restore_service.RestoreError):
                        restore_service._extract_media(archive)
            self.assertFalse(os.path.exists(os.path.join(tmp, 'a.bin')))

    def test_mid_extract_failure_leaves_existing_files_untouched(self):
        import os
        with tempfile.TemporaryDirectory() as tmp:
            existing = os.path.join(tmp, 'a.txt')
            with open(existing, 'wb') as f:
                f.write(b'original')
            archive = self._zip({'media/a.txt': b'replaced', 'media/b.txt': b'second'})
            real_open = archive.open

            def failing_open(info, *args, **kwargs):
                if info.filename.endswith('b.txt'):
                    raise OSError('disk error')
                return real_open(info, *args, **kwargs)

            with override_settings(MEDIA_ROOT=tmp):
                with patch.object(archive, 'open', side_effect=failing_open):
                    with self.assertRaises(OSError):
                        restore_service._extract_media(archive)
            with open(existing, 'rb') as f:
                self.assertEqual(f.read(), b'original')
            self.assertFalse(os.path.exists(os.path.join(tmp, 'b.txt')))

    def test_valid_media_is_still_extracted(self):
        import os
        with tempfile.TemporaryDirectory() as tmp:
            archive = self._zip({'media/sub/a.txt': b'hello'})
            with override_settings(MEDIA_ROOT=tmp):
                self.assertEqual(restore_service._extract_media(archive), 1)
            with open(os.path.join(tmp, 'sub', 'a.txt'), 'rb') as f:
                self.assertEqual(f.read(), b'hello')


class RestoreSequenceResetTests(TestCase):
    """Raw saves with explicit PKs do not advance PostgreSQL sequences (loaddata resets them)."""

    def setUp(self):
        self.user = User.objects.create_user(username='admin', password='password', is_superuser=True)
        Group.objects.create(name='g1')
        media_root_cm = tempfile.TemporaryDirectory()
        self.addCleanup(media_root_cm.cleanup)
        override = override_settings(MEDIA_ROOT=media_root_cm.name)
        override.enable()
        self.addCleanup(override.disable)
        self.record = backup_service.create_backup(self.user, include_media=False)

    def test_commit_resets_sequences_for_every_restored_model(self):
        from django.db import connection

        with patch.object(connection.ops, 'sequence_reset_sql', return_value=[]) as reset:
            with self.record.file.open('rb') as fh:
                restore_service.commit(fh, approved_models=['auth.group'], confirmed=True, user=self.user)

        reset.assert_called_once()
        restored = reset.call_args.args[1]
        self.assertIn(Group, restored)

    def test_generated_sequence_sql_is_executed(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        marker = 'SELECT 424242'
        with patch.object(connection.ops, 'sequence_reset_sql', return_value=[marker]):
            with CaptureQueriesContext(connection) as queries:
                with self.record.file.open('rb') as fh:
                    restore_service.commit(
                        fh, approved_models=['auth.group'], confirmed=True, user=self.user
                    )

        self.assertIn(marker, [q['sql'] for q in queries.captured_queries])


class RestoreMissingSignalDrivenRowsTests(TestCase):
    """Restoring deleted Users, UserProfiles (with hire_date), and Teams must
    not trigger post_save side-effect creation or notification dispatches."""

    def test_restore_deleted_user_profile_team_and_leave_balance_preserves_pks(self):
        import datetime as dt

        from apps.dashboard.models import CalendarWorkspace
        from apps.leave_management.models import LeaveBalance
        from apps.overtime.models.core import Client, OvertimeLog
        from apps.users.models import Team, UserProfile
        from plugins.notifications.models import Notification

        admin = User.objects.create_user(username='admin_sb', password='x', is_superuser=True)
        emp = User.objects.create_user(username='lost_emp', password='x')
        profile = emp.profile
        profile.hire_date = dt.date(2025, 1, 15)
        profile.save()
        team = Team.objects.create(name='Platform', code='PLAT')
        workspace = CalendarWorkspace.objects.get(team=team)
        balance = LeaveBalance.objects.get(user=emp, leave_type='vacation')
        client_obj = Client.objects.create(name='Restore Client', code='RCLI')
        ot = OvertimeLog(user=emp, client=client_obj, date=dt.date(2026, 10, 5), hours=2)
        ot._skip_notifications = True
        ot.save()

        orig_emp_pk = emp.pk
        orig_profile_pk = profile.pk
        orig_team_pk = team.pk
        orig_workspace_pk = workspace.pk
        orig_balance_pk = balance.pk
        orig_ot_pk = ot.pk
        notif_count_before = Notification.objects.count()

        with tempfile.TemporaryDirectory() as media:
            with override_settings(MEDIA_ROOT=media):
                record = backup_service.create_backup(admin, include_media=False)

                ot.delete()
                balance.delete()
                workspace.delete()
                team.delete()
                emp.delete()
                self.assertFalse(User.objects.filter(pk=orig_emp_pk).exists())
                self.assertFalse(UserProfile.objects.filter(pk=orig_profile_pk).exists())
                self.assertFalse(Team.objects.filter(pk=orig_team_pk).exists())

                with record.file.open('rb') as fh:
                    with self.captureOnCommitCallbacks(execute=True):
                        restore_service.commit(
                            fh,
                            approved_models=['auth.user', 'users.team'],
                            confirmed=True,
                            user=admin,
                        )

        self.assertTrue(User.objects.filter(pk=orig_emp_pk).exists())
        self.assertEqual(UserProfile.objects.get(user_id=orig_emp_pk).pk, orig_profile_pk)
        self.assertTrue(Team.objects.filter(pk=orig_team_pk).exists())
        self.assertEqual(CalendarWorkspace.objects.get(team_id=orig_team_pk).pk, orig_workspace_pk)
        self.assertEqual(
            LeaveBalance.objects.get(user_id=orig_emp_pk, leave_type='vacation').pk,
            orig_balance_pk,
        )
        self.assertTrue(OvertimeLog.objects.filter(pk=orig_ot_pk).exists())
        self.assertEqual(Notification.objects.count(), notif_count_before)


class HbprAssignmentNullCadenceRestoreTests(TestCase):
    """An HBPR assignment without a cadence (set later by the Line Manager)
    must come back from a backup with cadence still NULL, not a default."""

    def test_null_cadence_assignment_round_trips(self):
        import datetime as dt

        from apps.users.models.hbpr import HbprAlbanianTlAssignment

        admin = User.objects.create_user(username='admin_hb', password='x', is_superuser=True)
        hbpr = User.objects.create_user(username='hbpr_hb', password='x')
        lm = User.objects.create_user(username='lm_hb', password='x')
        row = HbprAlbanianTlAssignment.objects.create(
            hbpr=hbpr, albanian_tl=lm, effective_from=dt.date(2026, 1, 1))
        self.assertIsNone(row.cadence)
        pk = row.pk

        with tempfile.TemporaryDirectory() as media:
            with override_settings(MEDIA_ROOT=media):
                record = backup_service.create_backup(admin, include_media=False)
                HbprAlbanianTlAssignment.objects.filter(pk=pk).delete()
                with record.file.open('rb') as fh:
                    preview = restore_service.preview(fh)
                self.assertTrue(preview['schema_compatible'])
                with record.file.open('rb') as fh:
                    restore_service.commit(
                        fh,
                        approved_models=['users.hbpralbaniantlassignment'],
                        confirmed=True,
                        user=admin,
                    )

        restored = HbprAlbanianTlAssignment.objects.get(pk=pk)
        self.assertIsNone(restored.cadence)
        self.assertIsNone(restored.cadence_day_of_week)
        self.assertIsNone(restored.cadence_nth_week)
        self.assertEqual(restored.cadence_display, 'Not set')
        self.assertIsNone(restored.effective_to)


class ContentTypeRemapTests(TestCase):
    """R1: Permission rows point at ContentType, which is not in the fixture."""

    def test_restore_repoints_content_type_by_label_when_pks_shifted(self):
        from django.contrib.auth.models import Permission
        from django.contrib.contenttypes.models import ContentType

        admin = User.objects.create_user(username='admin', password='pw', is_superuser=True)
        group_ct = ContentType.objects.get_for_model(Group)
        perm = Permission.objects.filter(content_type=group_ct).first()
        perm_pk = perm.pk
        with tempfile.TemporaryDirectory() as media:
            with override_settings(MEDIA_ROOT=media):
                # Simulate a target DB with different ContentType PKs: the
                # backup's map says the permission's type was pk 99999.
                real = backup_service.content_type_labels()
                shifted = {('99999' if v == 'auth.group' else k): v for k, v in real.items()}
                shifted.pop(str(group_ct.pk), None)
                shifted['99999'] = 'auth.group'

                original = backup_service._write_db_dump
                with patch.object(backup_service, 'content_type_labels', return_value=shifted), \
                        patch.object(backup_service, '_write_db_dump', side_effect=lambda p: _rewrite(original, p, group_ct.pk)):
                    record = backup_service.create_backup(admin, include_media=False)

                perm.delete()
                with record.file.open('rb') as fh:
                    restore_service.commit(
                        fh, approved_models=['auth.permission'], confirmed=True, user=admin
                    )
        restored = Permission.objects.get(pk=perm_pk)
        self.assertEqual(restored.content_type_id, group_ct.pk)


def _rewrite(original, path, real_ct_pk):
    """Run the real dump, then rewrite Group-type permission FKs to pk 99999."""
    original(path)
    with gzip.open(path, 'rb') as fh:
        data = json.loads(fh.read().decode('utf-8'))
    for row in data:
        if row['model'] == 'auth.permission' and row['fields']['content_type'] == real_ct_pk:
            row['fields']['content_type'] = 99999
    with gzip.open(path, 'wb') as fh:
        fh.write(json.dumps(data).encode('utf-8'))
