"""Guards against the plugin-nav-link "silently missing" class of bug.

A plugin's `get_frontend_metadata()` names frontend component strings in
`routes`/`injection_slots`, resolved at runtime via `getPluginComponent()`
against `frontend/src/plugins/index.ts`. Two failure modes have shipped
before, both silent (no build error, no backend error — the link just
doesn't render):
  1. `plugin.py` never registers a slot the UI is expected to appear in
     (e.g. `admin-sidebar-nav`).
  2. A component's lazy-import entry gets misplaced under the WRONG
     plugin's key block in `plugins/index.ts` (a copy-paste/edit mistake),
     so `getPluginComponent(<right plugin>, <component>)` resolves to null
     even though the string exists somewhere else in the file.

This test parses each top-level `<plugin>: { ... }` block in
`plugins/index.ts` by brace-matching (not just "is the string anywhere in
the file") and cross-checks it against every backend plugin's declared
route/slot components.
"""
import re
from pathlib import Path

from django.conf import settings
from django.test import SimpleTestCase

from core.plugins.registry import plugin_registry

FRONTEND_INDEX = Path(settings.BASE_DIR) / 'frontend' / 'src' / 'plugins' / 'index.ts'


def _extract_plugin_blocks(source: str) -> dict:
    """Map plugin key -> its `{ ... }` block text from PLUGIN_COMPONENTS,
    using brace depth matching so nested `{}` (e.g. `.then((m) => ({...}))`)
    don't truncate the block early."""
    blocks = {}
    for match in re.finditer(r'^\s{2}(\w+):\s*\{', source, re.MULTILINE):
        key = match.group(1)
        start = match.end() - 1
        depth = 0
        pos = start
        while pos < len(source):
            if source[pos] == '{':
                depth += 1
            elif source[pos] == '}':
                depth -= 1
                if depth == 0:
                    break
            pos += 1
        blocks[key] = source[start:pos + 1]
    return blocks


class PluginRegistryConsistencyTest(SimpleTestCase):
    databases = []

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        plugin_registry.discover_plugins()
        cls.frontend_blocks = _extract_plugin_blocks(
            FRONTEND_INDEX.read_text(encoding='utf-8')
        )

    def test_every_route_and_slot_component_resolves_in_its_own_plugin_block(self):
        plugins = plugin_registry.get_all_plugins()
        self.assertTrue(plugins, "No plugins discovered — registry.discover_plugins() found nothing.")

        for plugin_name, plugin in plugins.items():
            metadata = plugin.get_frontend_metadata()
            components = [
                (r['component'], 'routes') for r in metadata.get('routes', [])
            ] + [
                (s['component'], 'injection_slots') for s in metadata.get('injection_slots', [])
            ]
            for component, source in components:
                with self.subTest(plugin=plugin_name, component=component, source=source):
                    block = self.frontend_blocks.get(plugin_name)
                    self.assertIsNotNone(
                        block,
                        f"plugins/onboarding-style check: no `{plugin_name}: {{...}}` block "
                        f"found in frontend/src/plugins/index.ts, but {plugin_name}.plugin.py's "
                        f"{source} references component `{component}`."
                    )
                    self.assertIn(
                        component,
                        block,
                        f"`{plugin_name}.plugin.py`'s {source} references component "
                        f"`{component}`, but it is not registered inside the "
                        f"`{plugin_name}: {{...}}` block in frontend/src/plugins/index.ts — "
                        f"getPluginComponent(\"{plugin_name}\", \"{component}\") resolves to "
                        f"null at runtime. Check it wasn't misplaced under another plugin's key."
                    )
