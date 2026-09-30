"""Tests for the OnlyOffice in-browser editor integration."""
from unittest.mock import patch

import json

import jwt
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.overtime.models.core import Client
from apps.users.models.core import UserProfile

from plugins.onboarding.models import Document
from plugins.onboarding.office_integration import (
    build_editor_config,
    is_editable_office,
    make_office_file_token,
    verify_office_file_token,
)
from plugins.onboarding.viewsets import DocumentViewSet

JWT_SECRET = 'test-onlyoffice-secret'
SERVER_URL = 'http://onlyoffice.test'


def _make_user(username, **kwargs):
    user = User.objects.create_user(username=username, password='testpass123', **kwargs)
    UserProfile.objects.get_or_create(user=user)
    return user


def _docx_file(name='report.docx', content=b'PK\x03\x04 fake docx bytes'):
    return SimpleUploadedFile(
        name, content,
        content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )


def _pdf_file(name='report.pdf', content=b'%PDF-1.4 test'):
    return SimpleUploadedFile(name, content, content_type='application/pdf')


@override_settings(ONLYOFFICE_DOCUMENT_SERVER_URL=SERVER_URL, ONLYOFFICE_JWT_SECRET=JWT_SECRET)
class OfficeEditorAPITests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        call_command('seed_plugin_permissions')

        self.client_a = Client.objects.create(name='Acme', code='ACME')
        self.client_b = Client.objects.create(name='Globex', code='GLBX')

        self.user_a = _make_user('user_a')
        self.user_a.profile.clients.add(self.client_a)

        self.unassigned = _make_user('unassigned')

        self.document = Document.objects.create(
            client=self.client_a, name='report.docx', file=_docx_file(), uploaded_by=self.user_a,
        )

    def _editor_config(self, user, pk):
        request = self.factory.get(f'/api/plugins/onboarding/documents/{pk}/editor-config/')
        force_authenticate(request, user=user)
        return DocumentViewSet.as_view({'get': 'editor_config'})(request, pk=pk)

    def _office_file(self, pk, token):
        request = self.factory.get(f'/api/plugins/onboarding/documents/{pk}/office-file/', {'token': token})
        return DocumentViewSet.as_view({'get': 'office_file'})(request, pk=pk)

    def _office_callback(self, pk, body, auth_header=None):
        extra = {'HTTP_AUTHORIZATION': auth_header} if auth_header else {}
        request = self.factory.post(
            f'/api/plugins/onboarding/documents/{pk}/office-callback/', body, format='json', **extra,
        )
        return DocumentViewSet.as_view({'post': 'office_callback'})(request, pk=pk)

    def _callback_jwt(self, payload):
        return jwt.encode(payload, JWT_SECRET, algorithm='HS256')

    # -- editor-config --

    def test_editor_config_returns_signed_config_for_assigned_user(self):
        resp = self._editor_config(self.user_a, self.document.id)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['document_server_url'], SERVER_URL)
        config = resp.data['config']
        self.assertEqual(config['editorConfig']['mode'], 'edit')
        self.assertIn('token', config)
        decoded = jwt.decode(config['token'], JWT_SECRET, algorithms=['HS256'])
        self.assertEqual(decoded['document']['fileType'], 'docx')

    @override_settings(ONLYOFFICE_DOCUMENT_SERVER_URL='', ONLYOFFICE_JWT_SECRET='')
    def test_editor_config_404_when_document_server_not_configured(self):
        resp = self._editor_config(self.user_a, self.document.id)
        self.assertEqual(resp.status_code, 404)

    def test_editor_config_400_for_non_office_file(self):
        pdf = Document.objects.create(
            client=self.client_a, name='report.pdf', file=_pdf_file(), uploaded_by=self.user_a,
        )
        resp = self._editor_config(self.user_a, pdf.id)
        self.assertEqual(resp.status_code, 400)

    def test_editor_config_404_for_unassigned_client_document(self):
        resp = self._editor_config(self.unassigned, self.document.id)
        self.assertEqual(resp.status_code, 404)

    # -- office-file --

    def test_office_file_serves_with_valid_token(self):
        token = make_office_file_token(self.document.id)
        resp = self._office_file(self.document.id, token)
        self.assertEqual(resp.status_code, 200)

    def test_office_file_rejects_invalid_token(self):
        resp = self._office_file(self.document.id, 'not-a-real-token')
        self.assertEqual(resp.status_code, 403)

    def test_office_file_rejects_token_minted_for_a_different_document(self):
        other = Document.objects.create(
            client=self.client_a, name='other.docx', file=_docx_file(name='other.docx'), uploaded_by=self.user_a,
        )
        token = make_office_file_token(other.id)
        resp = self._office_file(self.document.id, token)
        self.assertEqual(resp.status_code, 403)

    # -- office-callback --

    def test_office_callback_missing_jwt_returns_error_1(self):
        resp = self._office_callback(self.document.id, {'status': 2, 'key': f'{self.document.id}-1.0', 'url': 'http://x/y'})
        self.assertEqual(json.loads(resp.content)['error'], 1)

    def test_office_callback_invalid_jwt_returns_error_1(self):
        resp = self._office_callback(
            self.document.id, {'status': 2, 'key': f'{self.document.id}-1.0', 'url': 'http://x/y'}, auth_header='Bearer garbage',
        )
        self.assertEqual(json.loads(resp.content)['error'], 1)

    def test_office_callback_ignores_non_save_status(self):
        token = self._callback_jwt({'status': 1})
        resp = self._office_callback(self.document.id, {'status': 1}, auth_header=f'Bearer {token}')
        self.assertEqual(json.loads(resp.content)['error'], 0)
        self.document.refresh_from_db()
        self.assertEqual(self.document.updated_by, None)

    @patch('plugins.onboarding.viewsets.fetch_document_bytes')
    def test_office_callback_saves_new_file_and_sets_updated_by(self, mock_fetch):
        mock_fetch.return_value = b'PK\x03\x04 edited docx bytes'
        body = {'status': 2, 'key': f'{self.document.id}-1.0', 'url': 'http://onlyoffice.test/saved.docx', 'users': [str(self.user_a.id)]}
        token = self._callback_jwt(body)
        resp = self._office_callback(self.document.id, body, auth_header=f'Bearer {token}')
        self.assertEqual(json.loads(resp.content)['error'], 0)
        self.document.refresh_from_db()
        self.assertEqual(self.document.updated_by, self.user_a)
        self.assertEqual(self.document.file.read(), b'PK\x03\x04 edited docx bytes')

    @patch('plugins.onboarding.viewsets.fetch_document_bytes')
    def test_office_callback_rejects_saved_content_failing_validation(self, mock_fetch):
        mock_fetch.return_value = b'not a real docx'
        body = {'status': 2, 'key': f'{self.document.id}-1.0', 'url': 'http://onlyoffice.test/saved.docx', 'users': [str(self.user_a.id)]}
        token = self._callback_jwt(body)
        resp = self._office_callback(self.document.id, body, auth_header=f'Bearer {token}')
        self.assertEqual(json.loads(resp.content)['error'], 1)
        self.document.refresh_from_db()
        self.assertIsNone(self.document.updated_by)

    @patch('plugins.onboarding.viewsets.fetch_document_bytes')
    def test_office_callback_rejects_off_origin_download_url(self, mock_fetch):
        # `url` points outside the configured document server's own origin —
        # must be rejected before ever being fetched (SSRF guard).
        body = {'status': 2, 'key': f'{self.document.id}-1.0', 'url': 'http://attacker.example/steal', 'users': [str(self.user_a.id)]}
        token = self._callback_jwt(body)
        resp = self._office_callback(self.document.id, body, auth_header=f'Bearer {token}')
        self.assertEqual(json.loads(resp.content)['error'], 1)
        mock_fetch.assert_not_called()
        self.document.refresh_from_db()
        self.assertIsNone(self.document.updated_by)

    @patch('plugins.onboarding.viewsets.fetch_document_bytes')
    def test_office_callback_rejects_lookalike_origins_that_share_the_prefix(self, mock_fetch):
        # A bare startswith() lets these through: same string prefix, different host.
        for url in (
            'http://onlyoffice.test.attacker.example/steal',  # suffix on the hostname
            'http://onlyoffice.test@attacker.example/steal',  # userinfo trick
            'http://onlyoffice.test:8080/steal',              # different port
            'https://onlyoffice.test/steal',                  # different scheme
            'http://onlyoffice.testing/steal',                # hostname continues
        ):
            with self.subTest(url=url):
                body = {'status': 2, 'key': f'{self.document.id}-1.0', 'url': url, 'users': [str(self.user_a.id)]}
                token = self._callback_jwt(body)
                resp = self._office_callback(self.document.id, body, auth_header=f'Bearer {token}')
                self.assertEqual(json.loads(resp.content)['error'], 1)
        mock_fetch.assert_not_called()

    @patch('plugins.onboarding.viewsets.fetch_document_bytes')
    def test_office_callback_accepts_document_server_url_with_path_and_query(self, mock_fetch):
        mock_fetch.return_value = b'PK edited docx bytes'
        body = {
            'status': 2, 'key': f'{self.document.id}-1.0',
            'url': 'http://onlyoffice.test/cache/files/data/abc/output.docx/output.docx?md5=x&expires=1',
            'users': [str(self.user_a.id)],
        }
        token = self._callback_jwt(body)
        resp = self._office_callback(self.document.id, body, auth_header=f'Bearer {token}')
        self.assertEqual(json.loads(resp.content)['error'], 0)
        mock_fetch.assert_called_once()

    @patch('plugins.onboarding.viewsets.fetch_document_bytes')
    def test_office_callback_rejects_key_minted_for_another_document(self, mock_fetch):
        other = Document.objects.create(
            client=self.document.client, name='other.docx', file=_docx_file(), uploaded_by=self.user_a,
        )
        body = {
            'status': 2, 'key': f'{other.id}-1.0',
            'url': 'http://onlyoffice.test/saved.docx', 'users': [str(self.user_a.id)],
        }
        token = self._callback_jwt(body)
        resp = self._office_callback(self.document.id, body, auth_header=f'Bearer {token}')
        self.assertEqual(json.loads(resp.content)['error'], 1)
        mock_fetch.assert_not_called()

    @patch('plugins.onboarding.viewsets.fetch_document_bytes')
    def test_office_callback_returns_error_1_when_fetch_fails(self, mock_fetch):
        import http.client
        import urllib.error

        for exc in (
            urllib.error.HTTPError('http://onlyoffice.test/x', 302, 'redirect refused', {}, None),
            urllib.error.URLError('down'),
            http.client.InvalidURL('bad'),
            ValueError('bad'),
            ConnectionResetError('reset'),
        ):
            with self.subTest(exc=type(exc).__name__):
                mock_fetch.side_effect = exc
                body = {
                    'status': 2, 'key': f'{self.document.id}-1.0',
                    'url': 'http://onlyoffice.test/saved.docx', 'users': [str(self.user_a.id)],
                }
                token = self._callback_jwt(body)
                resp = self._office_callback(self.document.id, body, auth_header=f'Bearer {token}')
                self.assertEqual(json.loads(resp.content)['error'], 1)

    @patch('plugins.onboarding.viewsets.fetch_document_bytes')
    def test_office_callback_tolerates_non_numeric_acting_user_id(self, mock_fetch):
        mock_fetch.return_value = b'PK edited docx bytes'
        body = {
            'status': 2, 'key': f'{self.document.id}-1.0',
            'url': 'http://onlyoffice.test/saved.docx', 'users': ['not-a-number'],
        }
        token = self._callback_jwt(body)
        resp = self._office_callback(self.document.id, body, auth_header=f'Bearer {token}')
        self.assertEqual(json.loads(resp.content)['error'], 0)
        self.document.refresh_from_db()
        self.assertIsNone(self.document.updated_by)

    @patch('plugins.onboarding.viewsets.fetch_document_bytes')
    def test_office_callback_uses_jwt_payload_not_raw_body(self, mock_fetch):
        # The JWT is signed over a *different* body than what's actually
        # posted — everything read by the handler must come from the
        # decoded, authenticated payload, not the unauthenticated raw body.
        # Otherwise a forged body riding along a valid-looking header could
        # redirect the fetch or spoof the acting user.
        mock_fetch.return_value = b'PK\x03\x04 edited docx bytes'
        signed_body = {
            'status': 2, 'key': f'{self.document.id}-1.0',
            'url': 'http://onlyoffice.test/saved.docx', 'users': [str(self.user_a.id)],
        }
        token = self._callback_jwt(signed_body)
        forged_body = {
            'status': 2, 'key': f'{self.document.id}-1.0',
            'url': 'http://attacker.example/steal', 'users': [str(self.unassigned.id)],
        }
        resp = self._office_callback(self.document.id, forged_body, auth_header=f'Bearer {token}')
        self.assertEqual(json.loads(resp.content)['error'], 0)
        mock_fetch.assert_called_once()
        self.assertEqual(mock_fetch.call_args[0][0], 'http://onlyoffice.test/saved.docx')
        self.document.refresh_from_db()
        self.assertEqual(self.document.updated_by, self.user_a)

    @patch('plugins.onboarding.viewsets.fetch_document_bytes')
    def test_office_callback_deletes_previous_physical_file_after_saving(self, mock_fetch):
        old_file_name = self.document.file.name
        storage = self.document.file.storage
        self.assertTrue(storage.exists(old_file_name))

        mock_fetch.return_value = b'PK\x03\x04 edited docx bytes'
        body = {'status': 2, 'key': f'{self.document.id}-1.0', 'url': 'http://onlyoffice.test/saved.docx', 'users': [str(self.user_a.id)]}
        token = self._callback_jwt(body)
        resp = self._office_callback(self.document.id, body, auth_header=f'Bearer {token}')
        self.assertEqual(json.loads(resp.content)['error'], 0)

        self.assertFalse(storage.exists(old_file_name))
        self.document.refresh_from_db()
        self.addCleanup(lambda: storage.delete(self.document.file.name))


class OfficeIntegrationHelperTests(TestCase):
    def test_is_editable_office_extensions(self):
        self.assertTrue(is_editable_office('report.docx'))
        self.assertTrue(is_editable_office('sheet.XLSX'))
        self.assertFalse(is_editable_office('report.pdf'))
        self.assertFalse(is_editable_office('no_extension'))

    @override_settings(ONLYOFFICE_JWT_SECRET=JWT_SECRET, ONLYOFFICE_DOCUMENT_SERVER_URL=SERVER_URL)
    def test_build_editor_config_view_mode_omits_callback_url(self):
        user = _make_user('viewer')
        client_a = Client.objects.create(name='Acme', code='ACME2')
        document = Document.objects.create(
            client=client_a, name='report.docx', file=_docx_file(), uploaded_by=user,
        )
        factory = APIRequestFactory()
        request = factory.get('/')
        config = build_editor_config(document, user, request, can_edit=False)
        self.assertEqual(config['editorConfig']['mode'], 'view')
        self.assertEqual(config['editorConfig']['callbackUrl'], '')

    def test_verify_office_file_token_rejects_tampered_document_id(self):
        token = make_office_file_token(5)
        self.assertFalse(verify_office_file_token(token, 6))
        self.assertTrue(verify_office_file_token(token, 5))


class FetchDocumentBytesTests(TestCase):
    def test_redirects_are_not_followed(self):
        import threading
        import urllib.error
        from http.server import BaseHTTPRequestHandler, HTTPServer

        from plugins.onboarding.office_integration import fetch_document_bytes

        hits = []

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                hits.append(self.path)
                if self.path == '/start':
                    self.send_response(302)
                    self.send_header('Location', '/internal')
                    self.end_headers()
                else:
                    self.send_response(200)
                    self.end_headers()
                    self.wfile.write(b'internal secret')

            def log_message(self, *args):
                pass

        server = HTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with self.assertRaises(urllib.error.HTTPError):
                fetch_document_bytes(f'http://127.0.0.1:{server.server_port}/start', 1024)
        finally:
            server.shutdown()
            server.server_close()
        self.assertEqual(hits, ['/start'])
