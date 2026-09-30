"""`sync_plugins` registers discovered plugins in the Plugin table.

Fresh checkouts show zero active plugins until the admin-only `discover` API
action populates `plugins_plugin`; the management command does the same sync
from the CLI. Both go through `sync_plugin_registry`.
"""
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from apps.plugins.models import Plugin
from apps.plugins.services.registry_sync import sync_plugin_registry
from core.plugins.registry import plugin_registry


class SyncPluginRegistryTests(TestCase):
    def test_creates_a_disabled_row_for_every_discovered_plugin(self):
        synced = sync_plugin_registry()

        plugin_registry.discover_plugins()
        discovered = set(plugin_registry.get_all_plugins())
        self.assertTrue(discovered)
        self.assertEqual({p.name for p in synced}, discovered)
        self.assertEqual(set(Plugin.objects.values_list('name', flat=True)), discovered)
        # Syncing must never enable anything; that stays an explicit action.
        self.assertFalse(Plugin.objects.filter(is_enabled=True).exists())

    def test_is_idempotent_and_preserves_enabled_state(self):
        sync_plugin_registry()
        name = Plugin.objects.first().name
        Plugin.objects.filter(name=name).update(is_enabled=True, verbose_name='stale')

        sync_plugin_registry()

        row = Plugin.objects.get(name=name)
        self.assertTrue(row.is_enabled)
        self.assertNotEqual(row.verbose_name, 'stale')
        self.assertEqual(Plugin.objects.count(), len(plugin_registry.get_all_plugins()))


class SyncPluginsCommandTests(TestCase):
    def test_command_populates_the_plugin_table(self):
        out = StringIO()
        call_command('sync_plugins', stdout=out)

        self.assertTrue(Plugin.objects.exists())
        self.assertIn('Synced', out.getvalue())
        self.assertFalse(Plugin.objects.filter(is_enabled=True).exists())
