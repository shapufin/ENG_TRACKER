"""Large files are served by nginx behind a short-lived signed link (plan Y1).

gunicorn runs sync workers with a 120 s timeout, so a multi-GB export must not
stream through it, and a plain ``<a href>`` cannot carry the JWT.
"""
import os
import tempfile
from unittest import mock

from django.core import signing
from django.http import Http404
from django.test import SimpleTestCase, override_settings

from core.utils.protected_download import (
    DownloadTokenError,
    make_download_token,
    new_nonce,
    protected_file_response,
    read_download_token,
)


class DownloadTokenTests(SimpleTestCase):
    def _token(self, **overrides):
        values = dict(user_id=7, kind='export', object_id=42, nonce='abc')
        values.update(overrides)
        return make_download_token(**values)

    def test_round_trip_returns_what_was_signed(self):
        payload = read_download_token(self._token())
        self.assertEqual(payload, {'user_id': 7, 'kind': 'export', 'object_id': 42, 'nonce': 'abc'})

    def test_a_tampered_token_is_rejected(self):
        token = self._token()
        with self.assertRaises(DownloadTokenError):
            read_download_token(token[:-2] + ('AA' if not token.endswith('AA') else 'BB'))

    def test_a_token_signed_for_something_else_is_rejected(self):
        foreign = signing.dumps({'user_id': 7}, salt='another-feature')
        with self.assertRaises(DownloadTokenError):
            read_download_token(foreign)

    def test_an_expired_token_is_rejected(self):
        token = self._token()
        with mock.patch('django.core.signing.time.time', return_value=10 ** 11):
            with self.assertRaises(DownloadTokenError):
                read_download_token(token)

    def test_garbage_is_rejected(self):
        with self.assertRaises(DownloadTokenError):
            read_download_token('not-a-token')

    def test_nonces_are_unique_and_url_safe(self):
        first, second = new_nonce(), new_nonce()
        self.assertNotEqual(first, second)
        self.assertRegex(first, r'^[A-Za-z0-9_-]{16,}$')


class ProtectedFileResponseTests(SimpleTestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = tmp.name
        os.makedirs(os.path.join(self.root, '2026'))
        with open(os.path.join(self.root, '2026', 'team one.zip'), 'wb') as fh:
            fh.write(b'PK-data')

    def _serve(self, relative='2026/team one.zip', **kwargs):
        kwargs.setdefault('filename', 'team one.zip')
        kwargs.setdefault('accel_prefix', '/_protected/snapshots')
        return protected_file_response(self.root, relative, **kwargs)

    @override_settings(USE_X_ACCEL_REDIRECT=False)
    def test_without_nginx_the_file_is_streamed_as_an_attachment(self):
        response = self._serve()
        try:
            self.assertEqual(b''.join(response.streaming_content), b'PK-data')
            self.assertIn('attachment', response['Content-Disposition'])
            self.assertIn('team one.zip', response['Content-Disposition'])
        finally:
            response.close()

    @override_settings(USE_X_ACCEL_REDIRECT=True)
    def test_behind_nginx_the_body_is_empty_and_nginx_is_told_where_the_file_is(self):
        response = self._serve()
        self.assertEqual(response.content, b'')
        self.assertEqual(response['X-Accel-Redirect'], '/_protected/snapshots/2026/team%20one.zip')
        self.assertIn('attachment', response['Content-Disposition'])

    @override_settings(USE_X_ACCEL_REDIRECT=True)
    def test_a_quote_or_non_ascii_name_cannot_break_the_header(self):
        response = self._serve(filename='Q"3 ëxport.zip')
        self.assertNotIn('\n', response['Content-Disposition'])
        self.assertIn('attachment', response['Content-Disposition'])

    @override_settings(USE_X_ACCEL_REDIRECT=True)
    def test_paths_outside_the_root_are_refused(self):
        for bad in ('../secret.zip', '2026/../../secret.zip', '/etc/passwd', '..'):
            with self.subTest(path=bad):
                with self.assertRaises(Http404):
                    self._serve(relative=bad)

    @override_settings(USE_X_ACCEL_REDIRECT=True)
    def test_a_missing_file_is_a_404_not_an_nginx_error(self):
        with self.assertRaises(Http404):
            self._serve(relative='2026/gone.zip')
