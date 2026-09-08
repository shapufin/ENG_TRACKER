from abc import ABC, abstractmethod
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)

class BasePlugin(ABC):
    """
    Abstract base class for all plugins.
    Each plugin must implement this class and register it in its plugin.py file.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """The internal unique name of the plugin."""
        pass

    @property
    @abstractmethod
    def verbose_name(self) -> str:
        """The display name of the plugin."""
        pass

    @property
    @abstractmethod
    def description(self) -> str:
        """A short description of what the plugin does."""
        pass

    @property
    @abstractmethod
    def version(self) -> str:
        """The current version of the plugin."""
        pass

    @property
    def author(self) -> str:
        """The author of the plugin."""
        return "The Agency"

    def get_urls(self) -> List[Any]:
        """
        Returns a list of URL patterns for the plugin's API.
        Default is an empty list.
        """
        return []

    def get_frontend_metadata(self) -> Dict[str, Any]:
        """
        Returns metadata for the frontend, including injection slots and routes.
        """
        return {
            "name": self.name,
            "verbose_name": self.verbose_name,
            "description": self.description,
            "version": self.version,
            "routes": [],
            "injection_slots": []
        }

    def get_permission_actions(self) -> List[str]:
        """Return actions that administrators should configure for this plugin.

        The database keeps the full action vocabulary for compatibility, while
        the admin UI only shows capabilities the plugin actually uses.
        """
        return ["view", "manage"]

    def get_permission_manifest(self) -> Dict[str, Dict[str, Any]]:
        """Return explicit plugin action access defaults.

        Role names are stable database role codes. Missing actions are denied
        for non-staff users; ``is_public`` grants access to all authenticated
        users and takes precedence over roles.
        """
        return {
            action: {"roles": [], "public": False}
            for action in ("view", "manage", "configure", "export")
        }

    def get_config_schema(self) -> Dict[str, Any]:
        """
        Returns JSON schema for plugin configuration.
        Override this to define configurable settings.
        """
        return {}

    def validate_config(self, config: Dict[str, Any]) -> bool:
        """
        Validate plugin configuration against schema.
        Override this to add custom validation.
        """
        return True

    def ready(self):
        """
        Called when the plugin is loaded and enabled.
        Use this to connect signals, register tasks, etc.
        """
        pass

    def disable(self):
        """
        Called when the plugin is disabled.
        Use this to disconnect signals, etc.
        """
        pass

    def activate(self) -> bool:
        """
        Activate the plugin by creating database tables.
        Uses PluginTableManager for robust table creation.
        Idempotent - safe to call multiple times.
        """
        from core.plugins.initializer import PluginTableManager
        return PluginTableManager.ensure_plugin_tables(self.name)

    def deactivate(self) -> bool:
        """
        Deactivate the plugin by disabling it in the database.
        Does NOT drop tables - data is preserved for reactivation.
        """
        try:
            from apps.plugins.models import Plugin
            plugin = Plugin.objects.filter(name=self.name).first()
            if plugin:
                plugin.is_enabled = False
                plugin.save()
                logger.info(f"Plugin {self.name} deactivated")
            self.disable()
            return True
        except Exception as e:
            logger.error(f"Failed to deactivate plugin {self.name}: {str(e)}")
            return False

    def uninstall(self, backup_data: bool = False) -> bool:
        """
        Uninstall the plugin by dropping database tables.
        WARNING: This will delete all plugin data.
        Use backup_data=True to export data before dropping.
        """
        from core.plugins.initializer import PluginTableManager
        return PluginTableManager.drop_plugin_tables(self.name, backup_first=backup_data)

    def is_installed(self) -> bool:
        """
        Check if plugin tables exist in the database.
        """
        from core.plugins.initializer import PluginTableManager
        return PluginTableManager.plugin_tables_exist(self.name)

    def get_table_names(self) -> List[str]:
        """
        Return list of table names for this plugin.
        Uses PluginTableManager for robust table detection.
        """
        from core.plugins.initializer import PluginTableManager
        return PluginTableManager.get_plugin_tables(self.name)

    def _backup_data(self):
        """
        Export plugin data to JSON for backup.
        """
        try:
            from django.core.management import call_command
            app_label = f"plugins.{self.name}"
            call_command('dumpdata', app_label, indent=2, output=f'{self.name}_backup.json')
            logger.info(f"Backed up data for plugin {self.name}")
        except Exception as e:
            logger.error(f"Failed to backup data for plugin {self.name}: {str(e)}")
