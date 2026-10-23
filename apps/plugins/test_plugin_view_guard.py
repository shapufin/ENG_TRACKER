"""Every plugin API view must refuse requests while its plugin is disabled.

All plugin URLs are mounted at boot, so ``PluginEnabledMixin`` (carried by
``PluginPermissionMixin`` too) is the only thing that turns a disabled plugin
into a 403. A new view without it stays reachable after the plugin is disabled.
Sibling ``viewsets_*.py`` modules are scanned as well as the ``viewsets``
package.
"""

import importlib
import inspect
import pkgutil

import plugins
from django.test import SimpleTestCase
from rest_framework.views import APIView

from core.mixins.permissions import PluginEnabledMixin

def _view_modules():
    for info in pkgutil.iter_modules(plugins.__path__):
        plugin_pkg = importlib.import_module(f'plugins.{info.name}')
        for sub in pkgutil.iter_modules(plugin_pkg.__path__):
            if sub.name != 'viewsets' and not sub.name.startswith('viewsets_'):
                continue
            module = importlib.import_module(f'plugins.{info.name}.{sub.name}')
            yield info.name, module
            for inner in getattr(module, '__path__', []) and pkgutil.iter_modules(module.__path__):
                yield info.name, importlib.import_module(f'{module.__name__}.{inner.name}')


class PluginViewGuardTests(SimpleTestCase):
    def test_every_plugin_view_refuses_a_disabled_plugin(self):
        offenders = []
        for plugin_name, module in _view_modules():
            for name, cls in inspect.getmembers(module, inspect.isclass):
                if cls.__module__ != module.__name__ or not issubclass(cls, APIView):
                    continue
                if name.endswith('Mixin') or issubclass(cls, PluginEnabledMixin):
                    continue
                offenders.append(f'{plugin_name}.{name}')
        self.assertEqual(offenders, [])
