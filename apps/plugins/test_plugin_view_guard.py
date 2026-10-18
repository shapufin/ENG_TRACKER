"""Every plugin API view must go through ``PluginPermissionMixin``.

The mixin is what refuses requests for a runtime-disabled plugin and applies
the plugin's permission grants. A new view without it silently skips both.
Views that legitimately do not use it are listed (with the reason) below.
"""

import importlib
import inspect
import pkgutil

import plugins
from django.test import SimpleTestCase
from rest_framework.views import APIView

from core.mixins.permissions import PluginPermissionMixin

EXEMPT = {
    # Personal inbox: every user reads their own notifications.
    ('notifications', 'NotificationViewSet'),
    # Admin-only (IsAdminUser) kill-switch for the notification system itself.
    ('notifications', 'NotificationEventTypeConfigViewSet'),
}


def _view_modules():
    for info in pkgutil.iter_modules(plugins.__path__):
        try:
            module = importlib.import_module(f'plugins.{info.name}.viewsets')
        except ImportError:
            continue
        yield info.name, module
        for sub in getattr(module, '__path__', []) and pkgutil.iter_modules(module.__path__):
            yield info.name, importlib.import_module(f'{module.__name__}.{sub.name}')


class PluginViewGuardTests(SimpleTestCase):
    def test_every_plugin_view_uses_the_permission_mixin(self):
        offenders = []
        for plugin_name, module in _view_modules():
            for name, cls in inspect.getmembers(module, inspect.isclass):
                if cls.__module__ != module.__name__ or not issubclass(cls, APIView):
                    continue
                if name.endswith('Mixin') or issubclass(cls, PluginPermissionMixin):
                    continue
                if (plugin_name, name) not in EXEMPT:
                    offenders.append(f'{plugin_name}.{name}')
        self.assertEqual(offenders, [])
