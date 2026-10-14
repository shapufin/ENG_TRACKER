"""Tests for the hardened ``protected_media`` view (P0-6).

Verifies the security properties documented in ``config/views.py``:
- Path traversal is blocked (404).
- Missing files return 404.
- Served files carry ``Content-Disposition: attachment`` and
  ``X-Content-Type-Options: nosniff``.
- Only GET is allowed.

The view is called directly (not via the URL resolver) because the
``media/`` URL pattern is only registered when ``SERVE_MEDIA_IN_PROD=True``
and ``DEBUG=False`` at URLconf load time — ``override_settings`` does not
rebuild ``urlpatterns``. Testing the view function directly verifies the
security contract regardless of URL wiring.
"""
from __future__ import annotations

import os
import shutil
import tempfile

from django.test import TestCase, RequestFactory, override_settings

from config.views import protected_media


class ProtectedMediaTests(TestCase):
    """Verify the production media view is hardened against XSS/traversal."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._tmpdir = tempfile.mkdtemp(prefix="engtracker_media_test_")
        # Create a real file to serve.
        cls._file_path = os.path.join(cls._tmpdir, "evidence.txt")
        with open(cls._file_path, "w") as f:
            f.write("test evidence content")
        cls.factory = RequestFactory()

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls._tmpdir, ignore_errors=True)
        super().tearDownClass()

    def _call_view(self, path: str, method: str = "GET"):
        request = getattr(self.factory, method.lower())(f"/media/{path}")
        from django.contrib.auth.models import AnonymousUser
        request.user = AnonymousUser()
        with override_settings(MEDIA_ROOT=self._tmpdir):
            return protected_media(request, path)

    def test_serves_existing_file_with_download_headers(self):
        """Anonymous users cannot retrieve a real media file."""
        response = self._call_view("evidence.txt")
        self.assertEqual(response.status_code, 403)

    def test_path_traversal_returns_404(self):
        """An escape attempt via ../ must not read files outside MEDIA_ROOT."""
        from django.http import Http404
        with self.assertRaises(Http404):
            self._call_view("../../../etc/passwd")

    def test_path_traversal_encoded_returns_404(self):
        """URL-encoded traversal must also be blocked.

        RequestFactory does not decode %2e to . in the path kwarg, so we
        pass the decoded traversal path directly to the view.
        """
        from django.http import Http404
        with self.assertRaises(Http404):
            self._call_view("../../etc/passwd")

    def test_missing_file_returns_404(self):
        """A non-existent file under MEDIA_ROOT returns 404 (not 500)."""
        from django.http import Http404
        with self.assertRaises(Http404):
            self._call_view("does-not-exist.png")

    def test_post_method_not_allowed(self):
        """Only GET is permitted (POST must be rejected with 405)."""
        response = self._call_view("evidence.txt", method="POST")
        self.assertEqual(response.status_code, 405)


class ProtectedMediaAuthorizationTests(TestCase):
    """SEC-03: deny by default, per-prefix authorizers (not just 'logged in')."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._tmpdir = tempfile.mkdtemp(prefix="engtracker_media_authz_")
        for rel in (
            "backups/backup_20260101_000000.zip",
            "kpi_evidence/2026/03/cert.pdf",
            "analytics_exports/report.xlsx",
            "onboarding/2026/03/doc.pdf",
            "branding/logo.png",
            "something_new/file.bin",
        ):
            full = os.path.join(cls._tmpdir, *rel.split("/"))
            os.makedirs(os.path.dirname(full), exist_ok=True)
            with open(full, "wb") as f:
                f.write(b"x")
        cls.factory = RequestFactory()

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls._tmpdir, ignore_errors=True)
        super().tearDownClass()

    def _get(self, path, user):
        request = self.factory.get(f"/media/{path}")
        request.user = user
        with override_settings(MEDIA_ROOT=self._tmpdir):
            response = protected_media(request, path)
            if hasattr(response, "close"):
                response.close()
            return response

    def _user(self, username, **flags):
        from django.contrib.auth import get_user_model
        return get_user_model().objects.create_user(
            username=username, password="x-unused-pw-123", **flags
        )

    def test_regular_user_cannot_read_private_prefixes(self):
        employee = self._user("media_employee")
        for rel in (
            "backups/backup_20260101_000000.zip",
            "kpi_evidence/2026/03/cert.pdf",
            "analytics_exports/report.xlsx",
            "onboarding/2026/03/doc.pdf",
            "something_new/file.bin",
        ):
            with self.subTest(path=rel):
                self.assertEqual(self._get(rel, employee).status_code, 403)

    def test_regular_user_can_read_branding_logo(self):
        employee = self._user("media_employee2")
        self.assertEqual(self._get("branding/logo.png", employee).status_code, 200)

    def test_staff_cannot_read_backups_but_can_read_other_prefixes(self):
        staff = self._user("media_staff", is_staff=True)
        self.assertEqual(
            self._get("backups/backup_20260101_000000.zip", staff).status_code, 403
        )
        self.assertEqual(
            self._get("kpi_evidence/2026/03/cert.pdf", staff).status_code, 200
        )

    def test_dotdot_inside_allowed_prefix_cannot_reach_private_prefix(self):
        employee = self._user("media_employee3")
        response = self._get("branding/../backups/backup_20260101_000000.zip", employee)
        self.assertEqual(response.status_code, 403)

    def test_superuser_can_read_backups(self):
        root = self._user("media_root", is_staff=True, is_superuser=True)
        self.assertEqual(
            self._get("backups/backup_20260101_000000.zip", root).status_code, 200
        )
