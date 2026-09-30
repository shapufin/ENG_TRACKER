"""`prepare_e2e_db` builds a fully working, seeded database for browser runs.

Playwright starts the web servers before its own global-setup, and plugin URLs
are computed once at process startup, so everything (tables, enabled plugins,
seed) must already exist when the servers boot.
"""
from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import TestCase

from apps.plugins.models import Plugin
from core.plugins.registry import plugin_registry


class PrepareE2EDbTests(TestCase):
    def test_enables_every_plugin_and_seeds_users(self):
        call_command("prepare_e2e_db", verbosity=0)

        plugin_registry.discover_plugins()
        discovered = set(plugin_registry.get_all_plugins())
        enabled = set(Plugin.objects.filter(is_enabled=True).values_list("name", flat=True))
        self.assertEqual(enabled, discovered)
        self.assertTrue(User.objects.filter(username="e2e_super", is_superuser=True).exists())
        self.assertTrue(User.objects.filter(username="e2e_employee_a").exists())

    def test_is_idempotent(self):
        call_command("prepare_e2e_db", verbosity=0)
        counts = (Plugin.objects.count(), User.objects.count())
        call_command("prepare_e2e_db", verbosity=0)
        self.assertEqual(counts, (Plugin.objects.count(), User.objects.count()))
        self.assertFalse(Plugin.objects.filter(is_enabled=False).exists())
