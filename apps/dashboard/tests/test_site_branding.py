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
        SiteBranding.objects.create(site_name="Acme Tracker")
        self.client.force_authenticate(self.employee)

        response = self.client.get("/api/dashboard/branding/current/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["site_name"], "Acme Tracker")

    def test_non_staff_cannot_update_branding(self):
        branding = SiteBranding.objects.create(site_name="Acme Tracker")
        self.client.force_authenticate(self.employee)

        response = self.client.patch(
            f"/api/dashboard/branding/{branding.id}/", {"site_name": "Hacked"}
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_can_update_site_name_and_logo(self):
        branding = SiteBranding.objects.create(site_name="Acme Tracker")
        self.client.force_authenticate(self.staff_user)
        logo = SimpleUploadedFile("logo.png", b"fake-image-bytes", content_type="image/png")

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

    def test_updating_site_name_without_logo_leaves_existing_logo_untouched(self):
        """The frontend leaves the file input empty when not changing the
        logo — a PATCH with no `logo` key must not clear the existing one.
        """
        logo = SimpleUploadedFile("logo.png", b"fake-image-bytes", content_type="image/png")
        branding = SiteBranding.objects.create(site_name="Acme Tracker", logo=logo)
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
