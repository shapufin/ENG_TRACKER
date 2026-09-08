from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient


class GlobalDashboardStatsPermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.employee = User.objects.create_user(username="employee", password="testpass")
        self.hr_user = User.objects.create_user(username="hr", password="testpass")
        self.hr_user.profile.is_hr_user = True
        self.hr_user.profile.save(update_fields=["is_hr_user"])
        self.staff_user = User.objects.create_user(
            username="staff", password="testpass", is_staff=True
        )

    def test_regular_employee_cannot_access_global_stats(self):
        self.client.force_authenticate(self.employee)

        response = self.client.get("/api/dashboard/widgets/global_stats/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_hr_user_can_access_global_stats(self):
        self.client.force_authenticate(self.hr_user)

        response = self.client.get("/api/dashboard/widgets/global_stats/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn("total_users", response.data)

    def test_staff_user_can_access_global_stats(self):
        self.client.force_authenticate(self.staff_user)

        response = self.client.get("/api/dashboard/widgets/global_stats/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
