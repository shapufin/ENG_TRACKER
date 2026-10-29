from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.dashboard.models import SiteBranding


class SiteBrandingViewSetTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.employee = User.objects.create_user(username="employee", password="testpass")
        self.staff_user = User.objects.create_user(
            username="staff", password="testpass", is_staff=True
        )

    def test_current_creates_singleton_on_first_call(self):
        self.assertFalse(SiteBranding.objects.exists())
        self.client.force_authenticate(self.employee)

        response = self.client.get("/api/dashboard/branding/current/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["site_name"], "Engineering Tracker")
        self.assertTrue(SiteBranding.objects.exists())

    def test_any_authenticated_user_can_read_current(self):
        SiteBranding.objects.create(pk=1, site_name="Acme Tracker")
        self.client.force_authenticate(self.employee)

        response = self.client.get("/api/dashboard/branding/current/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["site_name"], "Acme Tracker")

    def test_unauthenticated_user_can_read_current(self):
        SiteBranding.objects.create(pk=1, site_name="Public Branding Tracker")

        response = self.client.get("/api/dashboard/branding/current/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["site_name"], "Public Branding Tracker")

    def test_non_staff_cannot_update_branding(self):
        branding = SiteBranding.objects.create(pk=1, site_name="Acme Tracker")
        self.client.force_authenticate(self.employee)

        response = self.client.patch(
            f"/api/dashboard/branding/{branding.id}/", {"site_name": "Hacked"}
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_can_update_site_name_and_logo(self):
        branding = SiteBranding.objects.create(pk=1, site_name="Acme Tracker")
        self.client.force_authenticate(self.staff_user)
        logo = SimpleUploadedFile("logo.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 16, content_type="image/png")

        response = self.client.patch(
            f"/api/dashboard/branding/{branding.id}/",
            {"site_name": "New Name", "logo": logo},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        branding.refresh_from_db()
        self.assertEqual(branding.site_name, "New Name")
        self.assertTrue(branding.logo)
        self.assertIsNotNone(response.data["logo_url"])

    def test_logo_over_two_megabytes_is_rejected(self):
        branding = SiteBranding.objects.create(pk=1, site_name="Acme Tracker")
        self.client.force_authenticate(self.staff_user)
        big = SimpleUploadedFile(
            "logo.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * (2 * 1024 * 1024), content_type="image/png"
        )

        response = self.client.patch(
            f"/api/dashboard/branding/{branding.id}/", {"logo": big}, format="multipart"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("logo", response.data)
        branding.refresh_from_db()
        self.assertFalse(branding.logo)

    def test_updating_site_name_without_logo_leaves_existing_logo_untouched(self):
        """The frontend leaves the file input empty when not changing the
        logo — a PATCH with no `logo` key must not clear the existing one.
        """
        logo = SimpleUploadedFile("logo.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 16, content_type="image/png")
        branding = SiteBranding.objects.create(pk=1, site_name="Acme Tracker", logo=logo)
        original_logo_name = branding.logo.name
        self.client.force_authenticate(self.staff_user)

        response = self.client.patch(
            f"/api/dashboard/branding/{branding.id}/",
            {"site_name": "Renamed Only"},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        branding.refresh_from_db()
        self.assertEqual(branding.site_name, "Renamed Only")
        self.assertEqual(branding.logo.name, original_logo_name)


class SiteBrandingLogoValidationTests(TestCase):
    """SEC-13: the logo is served back to every user, so only real raster images."""
    PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
    JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 16
    WEBP = b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 8

    def setUp(self):
        self.client = APIClient()
        self.staff_user = User.objects.create_user(
            username="logo_staff", password="testpass", is_staff=True
        )
        self.client.force_authenticate(self.staff_user)
        self.branding = SiteBranding.objects.create(pk=1, site_name="Acme")

    def _upload(self, name, content, content_type="application/octet-stream"):
        return self.client.patch(
            f"/api/dashboard/branding/{self.branding.id}/",
            {"logo": SimpleUploadedFile(name, content, content_type=content_type)},
            format="multipart",
        )

    def test_svg_is_rejected(self):
        svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
        response = self._upload("logo.svg", svg, "image/svg+xml")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("logo", response.data)

    def test_html_renamed_to_png_is_rejected_by_content(self):
        response = self._upload("logo.png", b"<html><script>alert(1)</script></html>", "image/png")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_real_png_jpeg_and_webp_are_accepted(self):
        for name, data in (("a.png", self.PNG), ("b.jpg", self.JPEG), ("c.webp", self.WEBP)):
            with self.subTest(name=name):
                self.assertEqual(self._upload(name, data).status_code, status.HTTP_200_OK)
