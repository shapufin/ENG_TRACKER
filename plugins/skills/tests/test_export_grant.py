"""The skills ``export`` grant must actually gate the export endpoints."""

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.plugins.models import PluginPermission
from plugins.skills.viewsets import SkillExportViewSet


class ExportGrantTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.factory = APIRequestFactory()
        cls.employee = User.objects.create_user(username='exp_emp', password='x')
        cls.staff = User.objects.create_user(username='exp_staff', password='x', is_staff=True)
        # view stays public (self-service); export is revoked from everyone.
        PluginPermission.objects.update_or_create(
            plugin_name='skills', action='view', defaults={'is_public': True}
        )
        PluginPermission.objects.update_or_create(
            plugin_name='skills', action='export', defaults={'is_public': False}
        )

    def _get(self, user, action):
        request = self.factory.get('/skills/export/')
        force_authenticate(request, user=user)
        return SkillExportViewSet.as_view({'get': action})(request)

    def test_revoked_export_grant_blocks_csv_and_xlsx(self):
        self.assertEqual(self._get(self.employee, 'export').status_code, 403)
        self.assertEqual(self._get(self.employee, 'export_xlsx').status_code, 403)

    def test_staff_can_still_export(self):
        self.assertEqual(self._get(self.staff, 'export').status_code, 200)
        self.assertEqual(self._get(self.staff, 'export_xlsx').status_code, 200)
