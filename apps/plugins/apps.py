from django.apps import AppConfig

class PluginsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.plugins'
    verbose_name = 'Plugin Management'

    def ready(self):
        # We delay discovery until all apps are ready
        # to avoid circular imports with models
        from core.plugins.registry import plugin_registry
        plugin_registry.discover_plugins()

        # Call ready() on all discovered plugins without querying the DB.
        # DB access during app initialization triggers Django warnings and may
        # fail during migrations before the plugin table exists.
        for plugin in plugin_registry.get_all_plugins().values():
            plugin.ready()
