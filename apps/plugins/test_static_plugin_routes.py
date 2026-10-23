"""Plugin URLs are mounted from the filesystem at boot, never from the database.

Enabling a plugin in the admin UI must make its API answer without restarting
the backend, and a database that is down at boot must not drop plugin routes.
The runtime off switch is ``PluginEnabledMixin`` (see ``test_plugin_view_guard``).
"""
import importlib
from unittest import mock

from django.contrib.auth.models import User
from django.test import SimpleTestCase
from rest_framework.test import APITestCase

from apps.plugins.models import Plugin
from core.plugins.registry import plugin_registry


class StaticPluginMountTests(SimpleTestCase):
    def test_every_plugin_with_urls_is_mounted_without_touching_the_database(self):
        import apps.plugins.urls as plugin_urls

        expected = {
            name for name, plugin in plugin_registry.get_all_plugins().items() if plugin.get_urls()
        }
        self.assertTrue(expected)
        with mock.patch.object(
            plugin_registry, 'get_active_plugins', side_effect=RuntimeError('database touched'),
        ):
            reloaded = importlib.reload(plugin_urls)
        mounted = {str(p.pattern).rstrip('/') for p in reloaded.urlpatterns}
        self.assertLessEqual(expected, mounted)


class DisabledPluginRouteTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user('route-user', password='x')
        self.client.force_authenticate(self.user)

    def _set_enabled(self, name, enabled):
        Plugin.objects.update_or_create(name=name, defaults={'is_enabled': enabled})

    def test_notification_inbox_follows_the_plugin_switch(self):
        url = '/api/plugins/notifications/notifications/unread_count/'
        self._set_enabled('notifications', False)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 403)
        self.assertIn('disabled', str(response.data['detail']))
        self._set_enabled('notifications', True)
        self.assertEqual(self.client.get(url).status_code, 200)

    def test_my_records_follows_the_plugin_switch(self):
        url = '/api/plugins/tl_scorecard/my-records/'
        self._set_enabled('tl_scorecard', False)
        self.assertEqual(self.client.get(url).status_code, 403)
