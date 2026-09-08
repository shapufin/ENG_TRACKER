from django.contrib.auth import get_user_model
from django.urls import Resolver404, resolve
from rest_framework.test import APITestCase


User = get_user_model()


class PermissionApiSurfaceTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="permissions-api-admin",
            password="testpass",
            is_staff=True,
        )
        self.client.force_authenticate(self.admin)

    def test_live_permission_endpoints_are_registered(self):
        for endpoint in (
            "groups",
            "roles",
            "permissions",
            "user-roles",
            "user-groups",
            "role-permissions",
        ):
            with self.subTest(endpoint=endpoint):
                response = self.client.get(f"/api/permissions/{endpoint}/")
                self.assertEqual(response.status_code, 200)

    def test_removed_rbac_endpoints_are_not_registered(self):
        for endpoint in (
            "group-permissions",
            "team-permissions",
            "permission-delegations",
            "permission-sets",
            "permission-set-items",
        ):
            with self.subTest(endpoint=endpoint):
                with self.assertRaises(Resolver404):
                    resolve(f"/api/permissions/{endpoint}/")
