from apps.plugins.models import Plugin
from core.plugins.registry import plugin_registry


def sync_plugin_registry():
    """Re-discover plugins and sync them into the ``Plugin`` table.

    Creates missing rows (disabled) and refreshes display metadata on existing
    ones. Never changes ``is_enabled``. Returns the synced ``Plugin`` rows.
    """
    plugin_registry.discover_plugins()

    synced_plugins = []
    for name, plugin_instance in plugin_registry.get_all_plugins().items():
        plugin_obj, created = Plugin.objects.get_or_create(
            name=name,
            defaults={
                'verbose_name': plugin_instance.verbose_name,
                'description': plugin_instance.description,
                'version': plugin_instance.version,
            }
        )
        if not created:
            plugin_obj.verbose_name = plugin_instance.verbose_name
            plugin_obj.description = plugin_instance.description
            plugin_obj.version = plugin_instance.version
            plugin_obj.save()
        synced_plugins.append(plugin_obj)
    return synced_plugins
