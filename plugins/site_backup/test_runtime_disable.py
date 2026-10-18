"""A runtime-disabled site_backup plugin must refuse even superusers."""

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.plugins.models import Plugin
from plugins.site_backup.viewsets import BackupRecordViewSet, RestoreViewSet


class RuntimeDisableTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.superuser = User.objects.create_superuser('bk_root', 'r@example.com', 'x')

    def _set_enabled(self, enabled):
        Plugin.objects.update_or_create(
            name='site_backup',
            defaults={'verbose_name': 'Site Backup', 'version': '1', 'is_enabled': enabled},
        )

    def _list(self):
        request = APIRequestFactory().get('/backups/')
        force_authenticate(request, user=self.superuser)
        return BackupRecordViewSet.as_view({'get': 'list'})(request)

    def test_disabled_plugin_refuses_superuser(self):
        self._set_enabled(False)
        self.assertEqual(self._list().status_code, 403)

    def test_enabled_plugin_allows_superuser(self):
        self._set_enabled(True)
        self.assertEqual(self._list().status_code, 200)

    def test_restore_views_use_the_same_gate(self):
        from core.mixins.permissions import PluginPermissionMixin
        self.assertTrue(issubclass(RestoreViewSet, PluginPermissionMixin))
