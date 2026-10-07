"""A plugin that fails to import must be loud, never silently absent.

`discover_plugins()` skips a plugin whose module raises on import (typically a
dependency added to requirements.txt that the running venv never installed),
so the plugin vanished for every role with only a buried log line. It is now
recorded in `load_errors` and surfaced as a system check error, which
`runserver`/`migrate`/`test` all print.
"""
import importlib
from unittest import mock

from django.test import SimpleTestCase

from apps.plugins.checks import check_plugins_loaded
from core.plugins.registry import PluginRegistry, plugin_registry


class PluginLoadFailureTests(SimpleTestCase):
    def test_every_plugin_in_the_repo_imports(self):
        self.assertEqual(plugin_registry.load_errors, {})

    def test_import_failure_is_recorded(self):
        real_import = importlib.import_module

        def fake_import(name, *args, **kwargs):
            if name == 'plugins.tl_scorecard.plugin':
                raise ModuleNotFoundError("No module named 'pypdf'")
            return real_import(name, *args, **kwargs)

        # PluginRegistry is a singleton: restore its state after re-discovering.
        registry = PluginRegistry()
        with mock.patch.object(registry, '_plugins', registry._plugins),                 mock.patch.object(registry, 'load_errors', registry.load_errors),                 mock.patch('core.plugins.registry.importlib.import_module', fake_import):
            registry.discover_plugins()
            load_errors = dict(registry.load_errors)
            loaded = dict(registry.get_all_plugins())

        self.assertIn('pypdf', load_errors['tl_scorecard'])
        self.assertNotIn('tl_scorecard', loaded)

    def test_system_check_reports_each_failed_plugin(self):
        with mock.patch.object(
            plugin_registry, 'load_errors', {'tl_scorecard': "No module named 'pypdf'"}
        ):
            errors = check_plugins_loaded(None)

        self.assertEqual([e.id for e in errors], ['plugins.E001'])
        self.assertIn('tl_scorecard', errors[0].msg)
        self.assertIn('pypdf', errors[0].msg)
        self.assertIn('pip install -r requirements.txt', errors[0].hint)

    def test_system_check_is_silent_when_all_plugins_load(self):
        with mock.patch.object(plugin_registry, 'load_errors', {}):
            self.assertEqual(check_plugins_loaded(None), [])
