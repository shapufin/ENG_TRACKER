"""Core (apps/, core/, config/) must not grow hidden dependencies on plugins.

A plugin has to stay disable-able and removable. Three rules, all static:

1. Production code outside ``plugins/`` imports a plugin only inside a function
   or a ``try`` block (never an unguarded module-level import).
2. Every such import is listed in ``ALLOWED_IMPORTS``. A new coupling is a
   conscious decision: add the line here, with the fail-closed fallback in code.
3. ``config/`` never names a plugin package (OpenAPI enum names are registered
   by each plugin's ``apps.py``, see ``plugins/ticket_kpi/apps.py``).

Tests, migrations and ``tests`` packages are exempt.
"""

import ast
from pathlib import Path

from django.conf import settings
from django.test import SimpleTestCase

REPO_ROOT = Path(settings.BASE_DIR)
SCANNED = ("apps", "core", "config")

# file (posix, repo-relative) -> plugins it may import.
ALLOWED_IMPORTS = {
    "apps/dashboard/admin_overview.py": {"site_backup"},
    "apps/dashboard/models/calendar.py": {"control_room"},
    "apps/dashboard/services/holiday_sync.py": {"payroll"},
    "apps/dashboard/signals.py": {"payroll"},
    "apps/leave_management/viewsets.py": {"audit_log", "notifications"},
    "apps/overtime/paid_blocks.py": {"payroll"},
    "apps/overtime/viewsets.py": {"audit_log", "notifications", "payroll"},
    "apps/plugins/management/commands/prepare_e2e_db.py": {"payroll"},
    "apps/plugins/viewsets.py": {"audit_log", "control_room"},
    "apps/reports/services/audit_archive.py": {"audit_log"},
    "apps/reports/services/export_service.py": {"payroll"},
    "apps/reports/services/security_audit.py": {"audit_log"},
    "apps/reports/viewsets.py": {"control_room"},
    "apps/standby/admin.py": {"payroll"},
    "apps/standby/viewsets.py": {"audit_log", "notifications", "payroll"},
    # Demo seeder: loaded only when invoked by name, so it cannot break startup.
    "apps/users/management/commands/seed_skills_demo.py": {"skills"},
    # Security-event audit trail; every import is inside a fail-closed ``try`` (no plugin, no trail).
    "apps/users/serializers.py": {"control_room"},
    "apps/users/viewsets.py": {"audit_log", "control_room"},
    "core/mixins/permissions.py": {"control_room"},
}
MODULE_LEVEL_EXEMPT = {"apps/users/management/commands/seed_skills_demo.py"}


def _production_files():
    for folder in SCANNED:
        for path in (REPO_ROOT / folder).rglob("*.py"):
            name = path.name
            if (
                "migrations" in path.parts
                or "tests" in path.parts
                or name.startswith("test_")
                or name in {"tests.py", "conftest.py"}
            ):
                continue
            yield path


def _plugin_imports(tree):
    """Yield (plugin, lineno, guarded) for every ``plugins.<x>`` import."""

    def walk(node, guarded):
        for child in ast.iter_child_nodes(node):
            child_guarded = guarded or isinstance(
                child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Try)
            )
            if isinstance(child, (ast.Import, ast.ImportFrom)):
                modules = (
                    [child.module]
                    if isinstance(child, ast.ImportFrom)
                    else [alias.name for alias in child.names]
                )
                for module in modules:
                    if module and module.startswith("plugins."):
                        yield module.split(".")[1], child.lineno, guarded
            yield from walk(child, child_guarded)

    yield from walk(tree, False)


class CorePluginIsolationTests(SimpleTestCase):
    def test_plugin_imports_are_guarded_and_allow_listed(self):
        unguarded, unlisted = [], []
        for path in _production_files():
            rel = path.relative_to(REPO_ROOT).as_posix()
            tree = ast.parse(path.read_text(encoding="utf-8-sig"))
            for plugin, lineno, guarded in _plugin_imports(tree):
                if not guarded and rel not in MODULE_LEVEL_EXEMPT:
                    unguarded.append(f"{rel}:{lineno} ({plugin})")
                if plugin not in ALLOWED_IMPORTS.get(rel, set()):
                    unlisted.append(f"{rel}:{lineno} ({plugin})")
        self.assertEqual(unguarded, [], "module-level plugin import in core")
        self.assertEqual(unlisted, [], "add to ALLOWED_IMPORTS only with a fail-closed fallback")

    def test_allow_list_has_no_stale_entries(self):
        seen = {}
        for path in _production_files():
            rel = path.relative_to(REPO_ROOT).as_posix()
            tree = ast.parse(path.read_text(encoding="utf-8-sig"))
            for plugin, _, _ in _plugin_imports(tree):
                seen.setdefault(rel, set()).add(plugin)
        self.assertEqual(seen, ALLOWED_IMPORTS)

    def test_config_never_names_a_plugin_package(self):
        offenders = []
        for path in (REPO_ROOT / "config").rglob("*.py"):
            tree = ast.parse(path.read_text(encoding="utf-8-sig"))
            for node in ast.walk(tree):
                if (
                    isinstance(node, ast.Constant)
                    and isinstance(node.value, str)
                    and node.value.startswith("plugins.")
                ):
                    offenders.append(f"{path.name}:{node.lineno} {node.value}")
        self.assertEqual(offenders, [])
