import os
import importlib
import logging
import threading
from typing import Dict
from core.plugins.base import BasePlugin

logger = logging.getLogger(__name__)

class PluginRegistry:
    _instance = None
    _plugins: Dict[str, BasePlugin] = {}
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super(PluginRegistry, cls).__new__(cls)
        return cls._instance

    def discover_plugins(self):
        """Scan the top-level ``plugins/`` directory for plugin definitions."""
        plugins_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'plugins'
        )
        if not os.path.exists(plugins_dir):
            os.makedirs(plugins_dir)
            return

        discovered_plugins = {}
        for plugin_name in sorted(os.listdir(plugins_dir)):
            plugin_path = os.path.join(plugins_dir, plugin_name)
            plugin_file = os.path.join(plugin_path, 'plugin.py')
            if not os.path.isdir(plugin_path) or not os.path.isfile(plugin_file):
                continue

            try:
                module_name = f'plugins.{plugin_name}.plugin'
                module = importlib.import_module(module_name)

                for attr_name in dir(module):
                    attr = getattr(module, attr_name)
                    if (
                        isinstance(attr, type)
                        and issubclass(attr, BasePlugin)
                        and attr is not BasePlugin
                    ):
                        plugin_instance = attr()
                        discovered_plugins[plugin_instance.name] = plugin_instance
                        logger.info(
                            "Discovered plugin: %s v%s",
                            plugin_instance.name,
                            plugin_instance.version,
                        )
            except Exception as e:
                logger.error("Failed to load plugin %s: %s", plugin_name, e)

        with self._lock:
            self._plugins = discovered_plugins

    def get_plugin_apps(self) -> list:
        """Return valid plugin app labels for ``INSTALLED_APPS``.

        Disabled plugins remain installed so Django can resolve their models and
        migrations, but filesystem artifacts such as ``__pycache__`` are never
        treated as Django apps.
        """
        apps = []
        plugins_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'plugins'
        )
        if os.path.exists(plugins_dir):
            for plugin_name in sorted(os.listdir(plugins_dir)):
                plugin_path = os.path.join(plugins_dir, plugin_name)
                if os.path.isfile(os.path.join(plugin_path, 'plugin.py')):
                    apps.append(f'plugins.{plugin_name}')
        return apps

    def get_plugin(self, name: str) -> BasePlugin:
        return self._plugins.get(name)

    def get_all_plugins(self) -> Dict[str, BasePlugin]:
        return self._plugins

    def get_active_plugins(self) -> Dict[str, BasePlugin]:
        """
        Returns only plugins that are enabled in the database.
        This requires apps.plugins to be loaded.
        """
        from apps.plugins.models import Plugin
        active_names = Plugin.objects.filter(is_enabled=True).values_list('name', flat=True)
        return {name: self._plugins[name] for name in active_names if name in self._plugins}

    def activate_plugin(self, plugin_name: str) -> bool:
        """
        Activate a plugin by creating its tables and enabling it in the database.
        Thread-safe with isolation - one plugin failure doesn't affect others.
        """
        with self._lock:
            if plugin_name not in self._plugins:
                logger.error(f"Plugin {plugin_name} not found in registry")
                return False

            plugin = self._plugins[plugin_name]

            # Check for circular dependencies
            if not self._check_dependencies(plugin_name):
                logger.error(f"Plugin {plugin_name} has unmet dependencies")
                return False

            try:
                from apps.plugins.services.permission_manifest import validate_manifest
                validate_manifest(plugin.get_permission_manifest())
                if not plugin.activate():
                    logger.error(f"Failed to activate plugin {plugin_name}")
                    return False
            except Exception as e:
                logger.error(f"Exception during plugin {plugin_name} activation: {str(e)}")
                return False

            try:
                from apps.plugins.models import Plugin
                plugin_obj, created = Plugin.objects.get_or_create(
                    name=plugin_name,
                    defaults={
                        'verbose_name': plugin.verbose_name,
                        'description': plugin.description,
                        'version': plugin.version,
                        'is_enabled': True
                    }
                )
                if not created:
                    plugin_obj.is_enabled = True
                    plugin_obj.save()
                try:
                    from apps.plugins.services.permission_manifest import sync_plugin_permission_manifest
                    sync_plugin_permission_manifest(plugin)
                    plugin.ready()
                except Exception as ready_error:
                    # Roll back the DB enable and tear down any side effects
                    # ready() produced before failing (e.g. partially
                    # connected signal handlers). transaction.atomic() would
                    # NOT roll back in-memory signal registrations, so we
                    # explicitly call disable() — the paired cleanup for
                    # ready() — wrapped in its own try/except so a disable
                    # failure does not mask the original ready() error.
                    plugin_obj.is_enabled = False
                    plugin_obj.save(update_fields=['is_enabled'])
                    try:
                        plugin.disable()
                    except Exception as disable_error:
                        logger.error(
                            f"Plugin {plugin_name} disable() also failed "
                            f"during ready() rollback: {disable_error}",
                            exc_info=True,
                        )
                    logger.error(
                        f"Plugin {plugin_name} ready hook failed during activation: {ready_error}",
                        exc_info=True,
                    )
                    return False
                logger.info(f"Plugin {plugin_name} activated and enabled in database")
                return True
            except Exception as e:
                logger.error(f"Failed to enable plugin {plugin_name} in database: {str(e)}")
                return False

    def deactivate_plugin(self, plugin_name: str) -> bool:
        """
        Deactivate a plugin by disabling it in the database.
        Tables are preserved for data.
        """
        if plugin_name not in self._plugins:
            logger.error(f"Plugin {plugin_name} not found in registry")
            return False

        plugin = self._plugins[plugin_name]
        if not plugin.deactivate():
            logger.error(f"Failed to deactivate plugin {plugin_name}")
            return False

        logger.info(f"Plugin {plugin_name} deactivated")
        return True

    def uninstall_plugin(self, plugin_name: str, backup_data: bool = False) -> bool:
        """
        Uninstall a plugin by dropping its tables and removing it from the
        database. WARNING: This will delete all plugin data.

        Performs full DB cleanup:
        - Drops all plugin tables (via PluginTableManager)
        - Deletes the Plugin row from plugins_plugin
        - Deletes PluginPermission rows (and their M2M through rows) from
          plugin_permissions + plugin_permissions_allowed_roles +
          plugin_permissions_allowed_groups

        Does NOT delete source code — use the `purge_plugin` management
        command for that (run by a developer from the repo root).
        """
        with self._lock:
            if plugin_name not in self._plugins:
                logger.error(f"Plugin {plugin_name} not found in registry")
                return False

            # Check if other plugins depend on this one
            dependents = self._get_dependents(plugin_name)
            if dependents:
                logger.error(f"Cannot uninstall {plugin_name}: depended on by {', '.join(dependents)}")
                return False

            plugin = self._plugins[plugin_name]
            if not plugin.uninstall(backup_data=backup_data):
                logger.error(f"Failed to uninstall plugin {plugin_name}")
                return False

            # DB cleanup: Plugin + PluginPermission rows + M2M through rows.
            # plugin.uninstall() only drops tables; the metadata rows would
            # otherwise be orphaned (this was the gap fixed 2026-07-26).
            self._cleanup_plugin_db_rows(plugin_name)

            # Remove from registry
            del self._plugins[plugin_name]
            logger.info(f"Plugin {plugin_name} uninstalled and removed from registry")
            return True

    @staticmethod
    def _cleanup_plugin_db_rows(plugin_name: str) -> None:
        """
        Delete the Plugin row, its PluginPermission rows, and the M2M
        through-table rows for those permissions. Safe to call when no rows
        exist (idempotent).
        """
        from django.db import connection
        try:
            with connection.cursor() as cursor:
                # M2M through tables first (FK to plugin_permissions).
                for m2m_table in (
                    "plugin_permissions_allowed_groups",
                    "plugin_permissions_allowed_roles",
                ):
                    cursor.execute(
                        f"DELETE FROM {m2m_table} "  # nosec B608 — table name is a hardcoded literal, not user input
                        f"WHERE pluginpermission_id IN ("
                        f"  SELECT id FROM plugin_permissions "
                        f"  WHERE plugin_name = %s"
                        f")",
                        [plugin_name],
                    )
                # PluginPermission rows.
                cursor.execute(
                    "DELETE FROM plugin_permissions WHERE plugin_name = %s",
                    [plugin_name],
                )
                # Plugin row.
                cursor.execute(
                    "DELETE FROM plugins_plugin WHERE name = %s",
                    [plugin_name],
                )
            logger.info(f"DB rows cleaned up for plugin {plugin_name}")
        except Exception as e:
            # Don't fail the whole uninstall if DB row cleanup errors —
            # tables are already dropped. Log so it can be cleaned up later.
            logger.warning(
                f"DB row cleanup for plugin {plugin_name} failed (tables "
                f"already dropped): {e}"
            )

    def _check_dependencies(self, plugin_name: str) -> bool:
        """
        Check if plugin dependencies are met.
        For now, this is a placeholder - implement dependency checking if needed.
        """
        # Placeholder for future dependency checking
        # Could check if required plugins are installed and enabled
        return True

    def _get_dependents(self, plugin_name: str) -> list:
        """
        Get list of plugins that depend on this plugin.
        For now, this is a placeholder - implement if plugins have dependencies.
        """
        # Placeholder for future dependency tracking
        return []

plugin_registry = PluginRegistry()
