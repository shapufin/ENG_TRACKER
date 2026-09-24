"""
Tests for the Onboarding plugin.
"""
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.overtime.models.core import Client
from apps.users.models.core import UserProfile

from plugins.onboarding.models import Document, Folder
from plugins.onboarding.viewsets import DocumentViewSet, FolderViewSet, OnboardingClientViewSet


def _make_user(username, **kwargs):
    user = User.objects.create_user(username=username, password='testpass123', **kwargs)
    UserProfile.objects.get_or_create(user=user)
    return user


def _make_client(name='Acme', code='ACME'):
    return Client.objects.create(name=name, code=code)


def _pdf_file(name='doc.pdf', content=b'%PDF-1.4 test'):
    return SimpleUploadedFile(name, content, content_type='application/pdf')


class OnboardingAPITests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        call_command('seed_plugin_permissions')

        self.client_a = _make_client('Acme', 'ACME')
        self.client_b = _make_client('Globex', 'GLBX')

        self.user_a = _make_user('user_a')
        self.user_a.profile.clients.add(self.client_a)

        self.user_b = _make_user('user_b')
        self.user_b.profile.clients.add(self.client_b)

        self.unassigned = _make_user('unassigned')

        self.staff = _make_user('staff', is_staff=True)

    def _clients_list(self, user):
        request = self.factory.get('/api/plugins/onboarding/clients/')
        force_authenticate(request, user=user)
        return OnboardingClientViewSet.as_view({'get': 'list'})(request)

    def _folders_list(self, user, **params):
        request = self.factory.get('/api/plugins/onboarding/folders/', params)
        force_authenticate(request, user=user)
        return FolderViewSet.as_view({'get': 'list'})(request)

    def _folders_create(self, user, data):
        request = self.factory.post('/api/plugins/onboarding/folders/', data)
        force_authenticate(request, user=user)
        return FolderViewSet.as_view({'post': 'create'})(request)

    def _folders_retrieve(self, user, pk):
        request = self.factory.get(f'/api/plugins/onboarding/folders/{pk}/')
        force_authenticate(request, user=user)
        return FolderViewSet.as_view({'get': 'retrieve'})(request, pk=pk)

    def _folders_delete(self, user, pk):
        request = self.factory.delete(f'/api/plugins/onboarding/folders/{pk}/')
        force_authenticate(request, user=user)
        return FolderViewSet.as_view({'delete': 'destroy'})(request, pk=pk)

    def _folders_move(self, user, pk, data):
        request = self.factory.post(f'/api/plugins/onboarding/folders/{pk}/move/', data)
        force_authenticate(request, user=user)
        return FolderViewSet.as_view({'post': 'move'})(request, pk=pk)

    def _folders_update(self, user, pk, data):
        request = self.factory.patch(f'/api/plugins/onboarding/folders/{pk}/', data)
        force_authenticate(request, user=user)
        return FolderViewSet.as_view({'patch': 'partial_update'})(request, pk=pk)

    def _documents_list(self, user, **params):
        request = self.factory.get('/api/plugins/onboarding/documents/', params)
        force_authenticate(request, user=user)
        return DocumentViewSet.as_view({'get': 'list'})(request)

    def _documents_create(self, user, data):
        request = self.factory.post('/api/plugins/onboarding/documents/', data, format='multipart')
        force_authenticate(request, user=user)
        return DocumentViewSet.as_view({'post': 'create'})(request)

    def _documents_move(self, user, pk, data):
        request = self.factory.post(f'/api/plugins/onboarding/documents/{pk}/move/', data)
        force_authenticate(request, user=user)
        return DocumentViewSet.as_view({'post': 'move'})(request, pk=pk)

    def _documents_update(self, user, pk, data):
        request = self.factory.patch(f'/api/plugins/onboarding/documents/{pk}/', data)
        force_authenticate(request, user=user)
        return DocumentViewSet.as_view({'patch': 'partial_update'})(request, pk=pk)

    def _search(self, user, **params):
        request = self.factory.get('/api/plugins/onboarding/folders/search/', params)
        force_authenticate(request, user=user)
        return FolderViewSet.as_view({'get': 'search'})(request)

    # -- client scoping --------------------------------------------------

    def test_zero_assigned_client_gets_empty_client_list(self):
        resp = self._clients_list(self.unassigned)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data, [])

    def test_assigned_user_sees_only_own_client(self):
        resp = self._clients_list(self.user_a)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual([c['code'] for c in resp.data], ['ACME'])

    def test_staff_sees_all_clients(self):
        resp = self._clients_list(self.staff)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual({c['code'] for c in resp.data}, {'ACME', 'GLBX'})

    # -- folder CRUD & isolation -----------------------------------------

    def test_create_folder_for_own_client(self):
        resp = self._folders_create(self.user_a, {'client': self.client_a.id, 'name': 'Contracts'})
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(Folder.objects.get(pk=resp.data['id']).created_by, self.user_a)

    def test_create_folder_for_unassigned_client_rejected(self):
        resp = self._folders_create(self.user_a, {'client': self.client_b.id, 'name': 'Contracts'})
        self.assertEqual(resp.status_code, 400)

    def test_duplicate_folder_name_in_same_parent_rejected(self):
        self._folders_create(self.user_a, {'client': self.client_a.id, 'name': 'Contracts'})
        resp = self._folders_create(self.user_a, {'client': self.client_a.id, 'name': 'Contracts'})
        self.assertEqual(resp.status_code, 400)

    def test_user_cannot_see_or_fetch_other_clients_folder_by_guessed_id(self):
        folder = Folder.objects.create(client=self.client_b, name='Secret')
        resp = self._folders_list(self.user_a, client_id=self.client_b.id)
        self.assertEqual(resp.data['results'], [])
        resp = self._folders_retrieve(self.user_a, folder.pk)
        self.assertEqual(resp.status_code, 404)

    def test_delete_folder_cascades_to_children_and_documents(self):
        parent = Folder.objects.create(client=self.client_a, name='Parent')
        child = Folder.objects.create(client=self.client_a, parent=parent, name='Child')
        doc = Document.objects.create(
            client=self.client_a, folder=child, name='f.pdf', file=_pdf_file(), uploaded_by=self.user_a,
        )
        resp = self._folders_delete(self.user_a, parent.pk)
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Folder.objects.filter(pk=child.pk).exists())
        self.assertFalse(Document.objects.filter(pk=doc.pk).exists())

    # -- move semantics ----------------------------------------------------

    def test_move_folder_into_itself_rejected(self):
        folder = Folder.objects.create(client=self.client_a, name='A')
        resp = self._folders_move(self.user_a, folder.pk, {'parent_id': folder.pk})
        self.assertEqual(resp.status_code, 400)

    def test_move_folder_into_own_descendant_rejected(self):
        parent = Folder.objects.create(client=self.client_a, name='Parent')
        child = Folder.objects.create(client=self.client_a, parent=parent, name='Child')
        resp = self._folders_move(self.user_a, parent.pk, {'parent_id': child.pk})
        self.assertEqual(resp.status_code, 400)

    def test_move_folder_to_different_client_rejected(self):
        folder_a = Folder.objects.create(client=self.client_a, name='A')
        folder_b = Folder.objects.create(client=self.client_b, name='B')
        resp = self._folders_move(self.staff, folder_a.pk, {'parent_id': folder_b.pk})
        self.assertEqual(resp.status_code, 400)

    def test_move_folder_valid_updates_parent(self):
        target = Folder.objects.create(client=self.client_a, name='Target')
        folder = Folder.objects.create(client=self.client_a, name='Movable')
        resp = self._folders_move(self.user_a, folder.pk, {'parent_id': target.pk})
        self.assertEqual(resp.status_code, 200)
        folder.refresh_from_db()
        self.assertEqual(folder.parent_id, target.pk)

    def test_move_document_to_different_client_folder_rejected(self):
        folder_b = Folder.objects.create(client=self.client_b, name='B')
        doc = Document.objects.create(
            client=self.client_a, name='f.pdf', file=_pdf_file(), uploaded_by=self.user_a,
        )
        resp = self._documents_move(self.staff, doc.pk, {'folder_id': folder_b.pk})
        self.assertEqual(resp.status_code, 400)

    def test_create_folder_with_cross_client_parent_rejected(self):
        # Only the dedicated move/ action validated this before — a plain
        # create with `parent` pointing at a different client's folder went
        # straight through. Caught by code review.
        foreign_parent = Folder.objects.create(client=self.client_b, name='Foreign')
        resp = self._folders_create(
            self.staff, {'client': self.client_a.id, 'parent': foreign_parent.pk, 'name': 'X'}
        )
        self.assertEqual(resp.status_code, 400)

    def test_update_folder_with_cross_client_parent_rejected(self):
        foreign_parent = Folder.objects.create(client=self.client_b, name='Foreign')
        folder = Folder.objects.create(client=self.client_a, name='Mine')
        resp = self._folders_update(self.staff, folder.pk, {'parent': foreign_parent.pk})
        self.assertEqual(resp.status_code, 400)

    def test_update_document_with_cross_client_folder_rejected(self):
        foreign_folder = Folder.objects.create(client=self.client_b, name='Foreign')
        doc = Document.objects.create(
            client=self.client_a, name='f.pdf', file=_pdf_file(), uploaded_by=self.user_a,
        )
        resp = self._documents_update(self.staff, doc.pk, {'folder': foreign_folder.pk})
        self.assertEqual(resp.status_code, 400)

    # -- updated_by ------------------------------------------------------------

    def test_rename_folder_sets_updated_by_to_the_acting_user(self):
        folder = Folder.objects.create(client=self.client_a, name='Original', created_by=self.staff)
        resp = self._folders_update(self.user_a, folder.pk, {'name': 'Renamed'})
        self.assertEqual(resp.status_code, 200)
        folder.refresh_from_db()
        self.assertEqual(folder.updated_by, self.user_a)
        self.assertEqual(resp.data['updated_by_name'], self.user_a.get_full_name() or self.user_a.username)

    def test_move_folder_sets_updated_by_to_the_acting_user(self):
        folder = Folder.objects.create(client=self.client_a, name='Mine')
        target = Folder.objects.create(client=self.client_a, name='Target')
        resp = self._folders_move(self.user_a, folder.pk, {'parent_id': target.pk})
        self.assertEqual(resp.status_code, 200)
        folder.refresh_from_db()
        self.assertEqual(folder.updated_by, self.user_a)

    def test_rename_document_sets_updated_by_to_the_acting_user(self):
        doc = Document.objects.create(
            client=self.client_a, name='f.pdf', file=_pdf_file(), uploaded_by=self.staff,
        )
        resp = self._documents_update(self.user_a, doc.pk, {'name': 'renamed.pdf'})
        self.assertEqual(resp.status_code, 200)
        doc.refresh_from_db()
        self.assertEqual(doc.updated_by, self.user_a)
        self.assertEqual(resp.data['updated_by_name'], self.user_a.get_full_name() or self.user_a.username)

    def test_move_document_sets_updated_by_to_the_acting_user(self):
        doc = Document.objects.create(client=self.client_a, name='f.pdf', file=_pdf_file())
        target = Folder.objects.create(client=self.client_a, name='Target')
        resp = self._documents_move(self.user_a, doc.pk, {'folder_id': target.pk})
        self.assertEqual(resp.status_code, 200)
        doc.refresh_from_db()
        self.assertEqual(doc.updated_by, self.user_a)

    def test_never_updated_folder_has_null_updated_by_name(self):
        folder = Folder.objects.create(client=self.client_a, name='Untouched', created_by=self.user_a)
        resp = self._folders_list(self.user_a, client_id=self.client_a.id)
        self.assertIsNone(resp.data['results'][0]['updated_by_name'])

    # -- search --------------------------------------------------------------

    def test_search_finds_matching_folders_and_documents_case_insensitively(self):
        Folder.objects.create(client=self.client_a, name='Contracts 2026')
        Folder.objects.create(client=self.client_a, name='Invoices')
        Document.objects.create(
            client=self.client_a, name='Signed Contract.pdf', file=_pdf_file(), uploaded_by=self.user_a,
        )
        resp = self._search(self.user_a, client_id=self.client_a.id, q='contract')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual([f['name'] for f in resp.data['folders']], ['Contracts 2026'])
        self.assertEqual([d['name'] for d in resp.data['documents']], ['Signed Contract.pdf'])

    def test_search_includes_ancestor_path_for_nested_matches(self):
        parent = Folder.objects.create(client=self.client_a, name='Parent')
        child = Folder.objects.create(client=self.client_a, parent=parent, name='Target Folder')
        Document.objects.create(
            client=self.client_a, folder=child, name='Target Doc.pdf', file=_pdf_file(), uploaded_by=self.user_a,
        )
        resp = self._search(self.user_a, client_id=self.client_a.id, q='target')
        self.assertEqual(resp.data['folders'][0]['path'], 'Parent')
        self.assertEqual(resp.data['documents'][0]['path'], 'Parent / Target Folder')
        # `ancestors` carries ids (not just names) so the frontend can jump
        # straight to any ancestor level, not just the matched folder itself.
        self.assertEqual(resp.data['folders'][0]['ancestors'], [{'id': parent.pk, 'name': 'Parent'}])
        self.assertEqual(
            resp.data['documents'][0]['ancestors'],
            [{'id': parent.pk, 'name': 'Parent'}, {'id': child.pk, 'name': 'Target Folder'}],
        )

    def test_search_with_non_numeric_client_id_rejected(self):
        # int(client_id) had no error handling and raised an unhandled
        # ValueError (500) instead of a clean 400. Caught by code review.
        resp = self._search(self.user_a, client_id='not-a-number', q='anything')
        self.assertEqual(resp.status_code, 400)

    def test_search_scoped_to_requested_client_only(self):
        Folder.objects.create(client=self.client_a, name='Shared Name')
        Folder.objects.create(client=self.client_b, name='Shared Name')
        resp = self._search(self.user_a, client_id=self.client_a.id, q='shared')
        self.assertEqual(len(resp.data['folders']), 1)

    def test_search_for_unassigned_client_rejected(self):
        resp = self._search(self.user_a, client_id=self.client_b.id, q='anything')
        self.assertEqual(resp.status_code, 400)

    def test_resolve_ancestor_chains_only_loads_needed_ids(self):
        # PERF-001: old `_folder_lookup` loaded every folder in the client on
        # every search keystroke. `_resolve_ancestor_chains` must resolve only
        # the ids actually needed for the given seed folders' ancestor paths.
        from plugins.onboarding.viewsets import _resolve_ancestor_chains

        parent = Folder.objects.create(client=self.client_a, name='Parent')
        child = Folder.objects.create(client=self.client_a, parent=parent, name='Child')
        for i in range(20):
            Folder.objects.create(client=self.client_a, name=f'Noise {i}')

        lookup = _resolve_ancestor_chains(self.client_a.id, [child.pk])

        self.assertEqual(set(lookup.keys()), {parent.pk, child.pk})
        self.assertEqual(lookup[child.pk], ('Child', parent.pk))
        self.assertEqual(lookup[parent.pk], ('Parent', None))

    def test_search_without_query_returns_empty(self):
        Folder.objects.create(client=self.client_a, name='Anything')
        resp = self._search(self.user_a, client_id=self.client_a.id, q='')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data, {'folders': [], 'documents': []})

    # -- upload validation --------------------------------------------------

    def test_upload_oversized_file_rejected(self):
        big = SimpleUploadedFile(
            'big.pdf', b'%PDF-1.4' + b'0' * (26 * 1024 * 1024), content_type='application/pdf'
        )
        resp = self._documents_create(self.user_a, {
            'client': self.client_a.id, 'file': big, 'name': 'big.pdf',
        })
        self.assertEqual(resp.status_code, 400)

    def test_upload_disallowed_extension_rejected(self):
        exe = SimpleUploadedFile('virus.exe', b'MZ...', content_type='application/octet-stream')
        resp = self._documents_create(self.user_a, {
            'client': self.client_a.id, 'file': exe, 'name': 'virus.exe',
        })
        self.assertEqual(resp.status_code, 400)

    def test_upload_signature_mismatch_rejected(self):
        fake_pdf = SimpleUploadedFile('fake.pdf', b'not a real pdf body', content_type='application/pdf')
        resp = self._documents_create(self.user_a, {
            'client': self.client_a.id, 'file': fake_pdf, 'name': 'fake.pdf',
        })
        self.assertEqual(resp.status_code, 400)

    def test_upload_valid_jpeg_extension_succeeds(self):
        # _matches_signature mapped the JPEG magic bytes to "jpg" only, so a
        # real JPEG saved with a ".jpeg" extension (very common) was rejected
        # as a signature mismatch. Caught by code review, not by the earlier
        # ".jpg"-only test.
        jpeg = SimpleUploadedFile('photo.jpeg', b'\xff\xd8\xff' + b'0' * 10, content_type='image/jpeg')
        resp = self._documents_create(self.user_a, {
            'client': self.client_a.id, 'file': jpeg, 'name': 'photo.jpeg',
        })
        self.assertEqual(resp.status_code, 201, resp.data)

    def test_upload_valid_pdf_succeeds(self):
        resp = self._documents_create(self.user_a, {
            'client': self.client_a.id, 'file': _pdf_file(), 'name': 'doc.pdf',
        })
        self.assertEqual(resp.status_code, 201, resp.data)
        doc = Document.objects.get(pk=resp.data['id'])
        self.assertEqual(doc.uploaded_by, self.user_a)
        # Caught live in browser verification: perform_create never passed
        # `file=` to serializer.save(), so the row was created with no file
        # attached and /download/ 500'd. Assert the file is actually there
        # and readable, not just that the API returned 201.
        self.assertTrue(doc.file.name)
        doc.file.open('rb')
        try:
            self.assertEqual(doc.file.read(), b'%PDF-1.4 test')
        finally:
            doc.file.close()

    def test_download_returns_the_uploaded_file_content(self):
        resp = self._documents_create(self.user_a, {
            'client': self.client_a.id, 'file': _pdf_file(), 'name': 'doc.pdf',
        })
        doc_id = resp.data['id']
        request = self.factory.get(f'/api/plugins/onboarding/documents/{doc_id}/download/')
        force_authenticate(request, user=self.user_a)
        download_resp = DocumentViewSet.as_view({'get': 'download'})(request, pk=doc_id)
        self.assertEqual(download_resp.status_code, 200)
        content = b''.join(download_resp.streaming_content)
        self.assertEqual(content, b'%PDF-1.4 test')

    def test_download_escapes_a_quote_in_the_renamed_filename(self):
        # Content-Disposition was built with an f-string interpolating
        # document.name (user-editable via rename) directly into
        # filename="...", which breaks the header if the name contains a
        # double quote. Now built via FileResponse(as_attachment=True,
        # filename=...), which escapes it correctly.
        resp = self._documents_create(self.user_a, {
            'client': self.client_a.id, 'file': _pdf_file(), 'name': 'doc.pdf',
        })
        doc_id = resp.data['id']
        rename_request = self.factory.patch(
            f'/api/plugins/onboarding/documents/{doc_id}/', {'name': 'weird"name.pdf'}
        )
        force_authenticate(rename_request, user=self.user_a)
        DocumentViewSet.as_view({'patch': 'partial_update'})(rename_request, pk=doc_id)

        request = self.factory.get(f'/api/plugins/onboarding/documents/{doc_id}/download/')
        force_authenticate(request, user=self.user_a)
        download_resp = DocumentViewSet.as_view({'get': 'download'})(request, pk=doc_id)
        self.assertEqual(download_resp.status_code, 200)
        disposition = download_resp['Content-Disposition']
        self.assertNotIn('weird"name.pdf"', disposition)

    def test_upload_without_name_defaults_to_file_name(self):
        # The frontend dropzone/file-picker upload never sends `name` — it
        # relies on this default. Caught live in browser verification: the
        # serializer originally required `name`, which the real UI never sent.
        resp = self._documents_create(self.user_a, {
            'client': self.client_a.id, 'file': _pdf_file(name='report.pdf'),
        })
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(Document.objects.get(pk=resp.data['id']).name, 'report.pdf')

    def test_upload_for_unassigned_client_rejected(self):
        resp = self._documents_create(self.user_a, {
            'client': self.client_b.id, 'file': _pdf_file(), 'name': 'doc.pdf',
        })
        self.assertEqual(resp.status_code, 400)
