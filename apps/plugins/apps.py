import logging

from django.apps import AppConfig

logger = logging.getLogger(__name__)


class PluginsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.plugins'
    verbose_name = 'Plugin Management'

    def ready(self):
        # We delay discovery until all apps are ready
        # to avoid circular imports with models
        from core.plugins.registry import plugin_registry
        plugin_registry.discover_plugins()

        # Only call ready() for plugins the DB marks enabled. Calling it
        # unconditionally on every discovered plugin (regardless of
        # is_enabled) reconnects a disabled plugin's signal handlers on
        # every server restart - see plugins/ticket_kpi/plugin.py's ready()
        # docstring for why that must not happen.
        from django.core.exceptions import ImproperlyConfigured
        from django.db.utils import Error as DBError
        try:
            active_plugins = plugin_registry.get_active_plugins()
        except (DBError, ImproperlyConfigured):
            # Plugin table doesn't exist yet (fresh install, mid-migration).
            # ready() will run later via plugin_registry.activate_plugin()
            # once the plugin is actually enabled.
            logger.warning("Plugin table not ready yet, skipping plugin ready() calls")
            return

        for plugin in active_plugins.values():
            plugin.ready()
