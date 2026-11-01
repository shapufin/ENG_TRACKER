"""Archived clients' onboarding data: superuser read-only, hidden from everyone else (plan A3)."""
import tempfile

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.core.signals import request_finished
from django.db import close_old_connections
from django.test import TestCase, override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.overtime.models.core import Client

from .models import Document, Folder
from .viewsets import DocumentViewSet, FolderViewSet, OnboardingClientViewSet


class ArchivedOnboardingAccessTests(TestCase):
    def setUp(self):
        # A closed FileResponse fires request_finished, whose close_old_connections receiver
        # closes the connection and poisons later tests on PostgreSQL ("connection already closed").
        request_finished.disconnect(close_old_connections)
        self.addCleanup(request_finished.connect, close_old_connections)
        media = tempfile.TemporaryDirectory()
        self.addCleanup(media.cleanup)
        override = override_settings(MEDIA_ROOT=media.name)
        override.enable()
        self.addCleanup(override.disable)
        call_command('seed_plugin_permissions')

        self.factory = APIRequestFactory()
        self.admin = User.objects.create_superuser(username='ao_admin', password='x')
        self.staff = User.objects.create_user(username='ao_staff', password='x', is_staff=True)
        self.member = User.objects.create_user(username='ao_member', password='x')

        self.live = Client.objects.create(name='Live', code='LIVE')
        self.old = Client.objects.create(name='Old', code='OLD')
        self.member.profile.clients.add(self.live, self.old)  # still assigned, but archived

        self.folder = Folder.objects.create(client=self.old, name='Contracts')
        self.doc = Document.objects.create(
            client=self.old, folder=self.folder, name='a.pdf', size_bytes=13, uploaded_by=self.admin,
            file=SimpleUploadedFile('a.pdf', b'%PDF-1.4 test', content_type='application/pdf'),
        )
        self.live_folder = Folder.objects.create(client=self.live, name='Live folder')
        self.old.is_active = False
        self.old.save(update_fields=['is_active'])

    def _call(self, view, method, user, url='/x/', data=None, **kwargs):
        request = getattr(self.factory, method)(url, data or {}, format='json')
        force_authenticate(request, user=user)
        return view(request, **kwargs)

    def _folders(self, user, **params):
        request = self.factory.get('/x/', params)
        force_authenticate(request, user=user)
        return FolderViewSet.as_view({'get': 'list'})(request)

    def _documents(self, user, **params):
        request = self.factory.get('/x/', params)
        force_authenticate(request, user=user)
        return DocumentViewSet.as_view({'get': 'list'})(request)

    def _clients(self, user, **params):
        request = self.factory.get('/x/', params)
        force_authenticate(request, user=user)
        return OnboardingClientViewSet.as_view({'get': 'list'})(request)

    @staticmethod
    def _ids(response):
        data = response.data['results'] if isinstance(response.data, dict) else response.data
        return {row['id'] for row in data}

    # --- reading --------------------------------------------------------
    def test_staff_and_assigned_users_do_not_see_archived_folders_or_documents(self):
        for user in (self.staff, self.member):
            self.assertNotIn(self.folder.id, self._ids(self._folders(user)), user.username)
            self.assertNotIn(self.doc.id, self._ids(self._documents(user)), user.username)

    def test_staff_and_users_still_see_live_client_data(self):
        self.assertIn(self.live_folder.id, self._ids(self._folders(self.staff)))
        self.assertIn(self.live_folder.id, self._ids(self._folders(self.member)))

    def test_superuser_sees_archived_folders_and_documents(self):
        self.assertIn(self.folder.id, self._ids(self._folders(self.admin, client_id=self.old.id)))
        self.assertIn(self.doc.id, self._ids(self._documents(self.admin, client_id=self.old.id)))

    def test_superuser_can_download_an_archived_document(self):
        response = self._call(
            DocumentViewSet.as_view({'get': 'download'}), 'get', self.admin, pk=self.doc.pk,
        )
        response.close()  # release the file handle (Windows cannot delete an open file)
        self.assertEqual(response.status_code, 200)

    def test_staff_cannot_download_an_archived_document(self):
        response = self._call(
            DocumentViewSet.as_view({'get': 'download'}), 'get', self.staff, pk=self.doc.pk,
        )
        if hasattr(response, 'close'):
            response.close()
        self.assertEqual(response.status_code, 404)

    # --- client list ----------------------------------------------------
    def test_default_client_list_stays_active_only(self):
        self.assertEqual(self._ids(self._clients(self.admin)), {self.live.id})

    def test_archived_client_list_is_superuser_only(self):
        self.assertEqual(self._ids(self._clients(self.admin, archived='true')), {self.old.id})
        self.assertEqual(self._clients(self.staff, archived='true').status_code, 403)
        self.assertEqual(self._clients(self.member, archived='true').status_code, 403)

    # --- writing is refused for everyone, superuser included --------------
    def test_archived_client_onboarding_is_read_only(self):
        folders = FolderViewSet.as_view
        documents = DocumentViewSet.as_view
        attempts = [
            self._call(folders({'post': 'create'}), 'post', self.admin,
                       data={'client': self.old.id, 'name': 'New'}),
            self._call(folders({'patch': 'partial_update'}), 'patch', self.admin,
                       data={'name': 'Renamed'}, pk=self.folder.pk),
            self._call(folders({'delete': 'destroy'}), 'delete', self.admin, pk=self.folder.pk),
            self._call(folders({'post': 'move'}), 'post', self.admin,
                       data={'parent_id': None}, pk=self.folder.pk),
            self._call(documents({'patch': 'partial_update'}), 'patch', self.admin,
                       data={'name': 'renamed.pdf'}, pk=self.doc.pk),
            self._call(documents({'delete': 'destroy'}), 'delete', self.admin, pk=self.doc.pk),
            self._call(documents({'post': 'move'}), 'post', self.admin,
                       data={'folder_id': None}, pk=self.doc.pk),
        ]
        for response in attempts:
            self.assertEqual(response.status_code, 400)
        self.assertTrue(Folder.objects.filter(pk=self.folder.pk, name='Contracts').exists())
        self.assertTrue(Document.objects.filter(pk=self.doc.pk, name='a.pdf').exists())

    def test_upload_to_archived_client_is_refused(self):
        request = self.factory.post(
            '/x/',
            {'client': self.old.id, 'file': SimpleUploadedFile(
                'b.pdf', b'%PDF-1.4 more', content_type='application/pdf')},
            format='multipart',
        )
        force_authenticate(request, user=self.admin)
        response = DocumentViewSet.as_view({'post': 'create'})(request)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Document.objects.filter(client=self.old).count(), 1)
