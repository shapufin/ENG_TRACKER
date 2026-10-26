"""Deleting an onboarding document, folder or client must not leave the file on disk."""
import os
import tempfile

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from apps.overtime.models.core import Client

from .models import Document, Folder


class DocumentFileCleanupTests(TestCase):
    def setUp(self):
        media = tempfile.TemporaryDirectory()
        self.addCleanup(media.cleanup)
        override = override_settings(MEDIA_ROOT=media.name)
        override.enable()
        self.addCleanup(override.disable)

        self.user = User.objects.create_user(username='fc_user', password='x')
        self.client_obj = Client.objects.create(name='Acme', code='ACME')
        self.folder = Folder.objects.create(client=self.client_obj, name='Contracts')
        self.doc = self._document('a.pdf', folder=self.folder)

    def _document(self, name, folder=None):
        return Document.objects.create(
            client=self.client_obj,
            folder=folder,
            name=name,
            file=SimpleUploadedFile(name, b'%PDF-1.4 test', content_type='application/pdf'),
            size_bytes=13,
            uploaded_by=self.user,
        )

    def _path(self, doc):
        return doc.file.path

    def test_document_delete_removes_file_after_commit(self):
        path = self._path(self.doc)
        self.assertTrue(os.path.exists(path))
        with self.captureOnCommitCallbacks(execute=True):
            self.doc.delete()
        self.assertFalse(os.path.exists(path))

    def test_file_is_kept_until_commit(self):
        path = self._path(self.doc)
        with self.captureOnCommitCallbacks(execute=False):
            self.doc.delete()
        self.assertTrue(os.path.exists(path))

    def test_folder_delete_removes_files_of_its_documents(self):
        path = self._path(self.doc)
        with self.captureOnCommitCallbacks(execute=True):
            self.folder.delete()
        self.assertFalse(os.path.exists(path))

    def test_client_delete_removes_all_onboarding_files(self):
        root_doc = self._document('root.pdf')
        paths = [self._path(self.doc), self._path(root_doc)]
        with self.captureOnCommitCallbacks(execute=True):
            self.client_obj.delete()
        self.assertTrue(all(not os.path.exists(p) for p in paths))

    def test_missing_file_on_disk_does_not_break_delete(self):
        os.remove(self._path(self.doc))
        with self.captureOnCommitCallbacks(execute=True):
            self.doc.delete()
        self.assertFalse(Document.objects.filter(pk=self.doc.pk).exists())
