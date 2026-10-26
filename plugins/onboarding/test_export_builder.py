"""Building a client's onboarding data into a ZIP, and the jobs that run it (plan A4)."""
import hashlib
import os
import tempfile
import zipfile
from datetime import timedelta
from unittest import mock

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.overtime.models.core import Client

from .models import ClientExport, Document, Folder
from .plugin import OnboardingPlugin
from .services import exporter


class ExportTestCase(TestCase):
    def setUp(self):
        self.media = tempfile.TemporaryDirectory()
        self.exports = tempfile.TemporaryDirectory()
        self.addCleanup(self.media.cleanup)
        self.addCleanup(self.exports.cleanup)
        override = override_settings(
            MEDIA_ROOT=self.media.name, EXPORT_ROOT=self.exports.name, EXPORT_JOBS_INLINE=False,
        )
        override.enable()
        self.addCleanup(override.disable)

        self.user = User.objects.create_user(username='eb_user', password='x')
        self.client_obj = Client.objects.create(name='Acme', code='ACME')

    def _folder(self, name, parent=None, client=None):
        return Folder.objects.create(client=client or self.client_obj, name=name, parent=parent)

    def _doc(self, name, folder=None, content=b'%PDF-1.4 data', client=None):
        return Document.objects.create(
            client=client or self.client_obj, folder=folder, name=name, size_bytes=len(content),
            uploaded_by=self.user,
            file=SimpleUploadedFile(name, content, content_type='application/pdf'),
        )

    def _export(self, kind='client', client=None, **extra):
        client = client if client is not None or kind == 'all' else self.client_obj
        return ClientExport.objects.create(
            kind=kind, client=client,
            client_code=client.code if client else '', client_name=client.name if client else '',
            requested_by=self.user, **extra,
        )

    def _zip(self, export):
        return zipfile.ZipFile(os.path.join(self.exports.name, export.relative_path))


class ExportBuilderTests(ExportTestCase):
    def setUp(self):
        super().setUp()
        contracts = self._folder('Contracts')
        year = self._folder('2026', parent=contracts)
        self._doc('readme.pdf', content=b'root-file')
        self._doc('a.pdf', folder=contracts, content=b'contract-a')
        self._doc('b.pdf', folder=year, content=b'contract-b')

    def test_zip_layout_follows_the_folder_tree(self):
        export = self._export()
        exporter.build_export(export)
        with self._zip(export) as archive:
            names = set(archive.namelist())
            self.assertEqual(archive.read('ACME - Acme/readme.pdf'), b'root-file')
            self.assertEqual(archive.read('ACME - Acme/Contracts/a.pdf'), b'contract-a')
            self.assertEqual(archive.read('ACME - Acme/Contracts/2026/b.pdf'), b'contract-b')
        self.assertIn('MANIFEST.txt', names)

    def test_zip_is_stored_uncompressed_and_valid(self):
        export = self._export()
        exporter.build_export(export)
        with self._zip(export) as archive:
            self.assertIsNone(archive.testzip())
            self.assertTrue(all(i.compress_type == zipfile.ZIP_STORED for i in archive.infolist()))

    def test_export_records_counts_size_and_checksum(self):
        export = self._export()
        exporter.build_export(export)
        export.refresh_from_db()
        path = os.path.join(self.exports.name, export.relative_path)
        self.assertEqual(export.status, 'ready')
        self.assertEqual((export.folders, export.documents), (2, 3))
        self.assertEqual(export.bytes, os.path.getsize(path))
        with open(path, 'rb') as fh:
            self.assertEqual(export.sha256, hashlib.sha256(fh.read()).hexdigest())
        self.assertIsNotNone(export.completed_at)

    def test_export_expires_in_a_day_and_leaves_no_partial_file(self):
        export = self._export()
        exporter.build_export(export)
        export.refresh_from_db()
        remaining = export.expires_at - timezone.now()
        self.assertTrue(timedelta(hours=23) < remaining <= timedelta(hours=24))
        leftovers = [n for n in os.listdir(os.path.join(self.exports.name, 'onboarding')) if n.endswith('.part')]
        self.assertEqual(leftovers, [])

    def test_unsafe_names_are_sanitised(self):
        client = Client.objects.create(name='Q/A: "Co"', code='QA')
        folder = self._folder('Q1/Q2', client=client)
        self._doc('a:b?.pdf', folder=folder, client=client)
        export = self._export(client=client)
        exporter.build_export(export)
        with self._zip(export) as archive:
            self.assertIn('QA - Q_A_ _Co_/Q1_Q2/a_b_.pdf', archive.namelist())

    def test_names_that_collide_after_sanitising_are_made_unique(self):
        folder = self._folder('Mixed')
        self._doc('a:b.pdf', folder=folder, content=b'one')
        self._doc('a_b.pdf', folder=folder, content=b'two')
        export = self._export()
        exporter.build_export(export)
        with self._zip(export) as archive:
            names = [n for n in archive.namelist() if n.startswith('ACME - Acme/Mixed/')]
        self.assertEqual(len(names), 2)
        self.assertEqual(len(set(names)), 2)
        self.assertTrue(any('(2)' in n for n in names))

    def test_a_missing_file_is_listed_in_the_manifest_not_fatal(self):
        gone = self._doc('gone.pdf', content=b'bye')
        os.remove(gone.file.path)
        export = self._export()
        exporter.build_export(export)
        export.refresh_from_db()
        self.assertEqual(export.status, 'ready')
        with self._zip(export) as archive:
            self.assertNotIn('ACME - Acme/gone.pdf', archive.namelist())
            manifest = archive.read('MANIFEST.txt').decode()
        self.assertIn('MISSING', manifest)
        self.assertIn('gone.pdf', manifest)

    def test_manifest_lists_every_file_with_its_checksum(self):
        export = self._export()
        exporter.build_export(export)
        with self._zip(export) as archive:
            manifest = archive.read('MANIFEST.txt').decode()
        self.assertIn(hashlib.sha256(b'contract-a').hexdigest(), manifest)
        self.assertIn('ACME - Acme/Contracts/a.pdf', manifest)

    def test_all_clients_export_has_one_top_folder_per_client_including_archived(self):
        old = Client.objects.create(name='Old', code='OLD', is_active=False)
        self._doc('old.pdf', client=old, content=b'old-data')
        export = self._export(kind='all', client=None)
        exporter.build_export(export)
        with self._zip(export) as archive:
            names = archive.namelist()
        self.assertIn('ACME - Acme/readme.pdf', names)
        self.assertIn('OLD - Old/old.pdf', names)

    def test_a_failure_marks_the_export_failed_and_leaves_no_file(self):
        export = self._export()
        with mock.patch.object(exporter, '_write_zip', side_effect=RuntimeError('disk full')):
            exporter.build_export(export)
        export.refresh_from_db()
        self.assertEqual(export.status, 'failed')
        self.assertIn('disk full', export.error)
        folder = os.path.join(self.exports.name, 'onboarding')
        self.assertEqual(os.listdir(folder) if os.path.isdir(folder) else [], [])

    def test_request_export_runs_inline_when_configured(self):
        with override_settings(EXPORT_JOBS_INLINE=True):
            export = exporter.request_export(self.user, 'client', self.client_obj)
        export.refresh_from_db()
        self.assertEqual(export.status, 'ready')
        self.assertEqual(export.client_code, 'ACME')

    def test_request_export_only_queues_when_the_scheduler_owns_jobs(self):
        export = exporter.request_export(self.user, 'client', self.client_obj)
        export.refresh_from_db()
        self.assertEqual(export.status, 'pending')


class ExportJobTests(ExportTestCase):
    def setUp(self):
        super().setUp()
        self._doc('readme.pdf')

    def test_process_builds_pending_exports_oldest_first(self):
        first = self._export()
        second = self._export()
        exporter.process_client_exports()
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual((first.status, second.status), ('ready', 'ready'))
        self.assertLessEqual(first.completed_at, second.completed_at)

    def test_process_ignores_exports_that_are_not_pending(self):
        done = self._export(status='ready')
        failed = self._export(status='failed', error='x')
        exporter.process_client_exports()
        done.refresh_from_db()
        failed.refresh_from_db()
        self.assertEqual((done.status, failed.status), ('ready', 'failed'))
        self.assertEqual(done.relative_path, '')

    def test_an_export_stuck_running_is_failed_so_it_cannot_block_forever(self):
        stuck = self._export(status='running', started_at=timezone.now() - timedelta(hours=3))
        recent = self._export(status='running', started_at=timezone.now() - timedelta(minutes=5))
        exporter.process_client_exports()
        stuck.refresh_from_db()
        recent.refresh_from_db()
        self.assertEqual(stuck.status, 'failed')
        self.assertIn('interrupted', stuck.error)
        self.assertEqual(recent.status, 'running')

    def test_cleanup_expires_old_exports_and_deletes_their_files(self):
        export = self._export()
        exporter.build_export(export)
        export.refresh_from_db()
        path = os.path.join(self.exports.name, export.relative_path)
        ClientExport.objects.filter(pk=export.pk).update(expires_at=timezone.now() - timedelta(minutes=1))
        exporter.cleanup_expired_exports()
        export.refresh_from_db()
        self.assertEqual(export.status, 'expired')
        self.assertFalse(os.path.exists(path))

    def test_cleanup_keeps_fresh_exports(self):
        export = self._export()
        exporter.build_export(export)
        exporter.cleanup_expired_exports()
        export.refresh_from_db()
        self.assertEqual(export.status, 'ready')

    def test_plugin_declares_its_two_jobs_with_importable_targets(self):
        from django.utils.module_loading import import_string

        jobs = OnboardingPlugin().get_scheduled_jobs()
        self.assertEqual({name for name, _, _ in jobs}, {'process_exports', 'cleanup_exports'})
        for _, interval, target in jobs:
            self.assertGreater(interval, 0)
            self.assertTrue(callable(import_string(target)))
