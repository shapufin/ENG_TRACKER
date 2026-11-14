"""A managed (seeded) role cannot be deleted: deleting it cascades every assignment (audithandover.md M3)."""
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from apps.permissions.models import Role

User = get_user_model()


class ManagedRoleDeleteTests(APITestCase):
    def setUp(self):
        self.su = User.objects.create_user(username='rdg_su', password='x', is_staff=True, is_superuser=True)
        self.hr, _ = Role.objects.get_or_create(code='hr', defaults={'name': 'HR'})
        self.custom = Role.objects.create(code='rdg_custom', name='Custom')
        self.api = APIClient()
        self.api.force_authenticate(self.su)

    def test_managed_role_delete_is_refused(self):
        resp = self.api.delete(f'/api/permissions/roles/{self.hr.id}/')
        self.assertEqual(resp.status_code, 409, getattr(resp, 'data', None))
        self.assertTrue(Role.objects.filter(code='hr').exists())

    def test_unmanaged_role_can_still_be_deleted(self):
        resp = self.api.delete(f'/api/permissions/roles/{self.custom.id}/')
        self.assertIn(resp.status_code, (200, 204), getattr(resp, 'data', None))
        self.assertFalse(Role.objects.filter(code='rdg_custom').exists())
