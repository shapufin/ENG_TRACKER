"""A runtime-disabled plugin's API stops answering (no restart needed).

Plugin URLs are mounted at process start, so toggling a plugin off only hid it
from ``active_metadata``. ``PluginPermissionMixin`` now refuses every request
when the Plugin row says ``is_enabled=False`` — staff and superusers included,
because these are data endpoints. An absent row stays allowed.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from plugins.payroll.viewsets import PayrollRunViewSet

User = get_user_model()


class DisabledPluginGateTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from apps.permissions.models import Role
        from apps.permissions.services.role_service import assign_role
        from apps.plugins.models import PluginPermission

        hr_role, _ = Role.objects.get_or_create(code='hr', defaults={'name': 'HR'})
        perm, _ = PluginPermission.objects.get_or_create(plugin_name='payroll', action='view')
        perm.allowed_roles.add(hr_role)
        cls.hr = User.objects.create_user(username='dp_hr', password='pass')
        assign_role(cls.hr, 'hr')
        cls.admin = User.objects.create_superuser(username='dp_admin', email='dp@test.com', password='pass')

    def _status(self, user):
        request = APIRequestFactory().get('/api/plugins/payroll/runs/')
        force_authenticate(request, user=user)
        return PayrollRunViewSet.as_view({'get': 'list'})(request).status_code

    def _set_enabled(self, enabled):
        from apps.plugins.models import Plugin

        Plugin.objects.update_or_create(
            name='payroll', defaults={'verbose_name': 'Payroll', 'version': '1', 'is_enabled': enabled},
        )

    def test_absent_plugin_row_stays_allowed(self):
        self.assertEqual(self._status(self.hr), 200)

    def test_disabled_plugin_refuses_granted_user_and_enable_restores(self):
        self._set_enabled(False)
        self.assertEqual(self._status(self.hr), 403)
        self._set_enabled(True)
        self.assertEqual(self._status(self.hr), 200)

    def test_disabled_plugin_refuses_superuser_too(self):
        self._set_enabled(False)
        self.assertEqual(self._status(self.admin), 403)
