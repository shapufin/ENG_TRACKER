"""The production boot sequence must leave HBPR denied/granted correctly.

The sequence under test is read from ``docker/entrypoint.sh`` itself, so removing
or reordering a step there fails this test instead of silently failing open in
production (a fresh database has no permission rows, and an upgraded one keeps
stale rows without the HBPR denial, until the manifest is reconciled).
"""
import re
from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.test import TestCase

from apps.plugins.models import PluginPermission

DENIED_FOR_HBPR = ('engagement', 'organigrama', 'skills', 'ticket_kpi')
# Commands of the entrypoint that mutate plugin/permission state and need no env.
PLUGIN_STATE_COMMANDS = ('sync_plugins', 'seed_plugin_permissions', 'grant_hbpr_plugin_access')


def entrypoint_plugin_commands():
    text = (Path(settings.BASE_DIR) / 'docker' / 'entrypoint.sh').read_text(encoding='utf-8')
    commands = re.findall(r'^python manage\.py (\w+)', text, flags=re.M)
    return [c for c in commands if c in PLUGIN_STATE_COMMANDS]


class BootPathLeavesHbprLockedDown(TestCase):
    def _boot(self):
        for command in entrypoint_plugin_commands():
            call_command(command, verbosity=0)

    def _denied(self, plugin):
        row = PluginPermission.objects.get(plugin_name=plugin, action='view')
        return set(row.denied_roles.values_list('code', flat=True))

    def test_entrypoint_runs_every_plugin_state_command_in_order(self):
        self.assertEqual(entrypoint_plugin_commands(), list(PLUGIN_STATE_COMMANDS))

    def test_fresh_boot_denies_hbpr_on_the_four_plugins(self):
        self._boot()
        for plugin in DENIED_FOR_HBPR:
            with self.subTest(plugin=plugin):
                self.assertIn('hbpr', self._denied(plugin))

    def test_fresh_boot_grants_hbpr_only_tl_scorecard(self):
        self._boot()
        granted = PluginPermission.objects.get(plugin_name='tl_scorecard', action='view')
        self.assertIn('hbpr', set(granted.allowed_roles.values_list('code', flat=True)))
        engagement = PluginPermission.objects.get(plugin_name='engagement', action='view')
        self.assertNotIn('hbpr', set(engagement.allowed_roles.values_list('code', flat=True)))

    def test_boot_is_idempotent(self):
        self._boot()
        self._boot()
        for plugin in DENIED_FOR_HBPR:
            self.assertIn('hbpr', self._denied(plugin))
        self.assertEqual(
            PluginPermission.objects.filter(plugin_name='tl_scorecard', action='view').count(), 1)

    def test_an_admin_removing_a_denial_is_restored_on_next_boot(self):
        self._boot()
        PluginPermission.objects.get(plugin_name='skills', action='view').denied_roles.clear()
        self._boot()
        self.assertIn('hbpr', self._denied('skills'))
