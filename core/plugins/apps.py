"""
Plugin system app configuration.
Handles plugin discovery and initialization on startup.
"""

import logging
from django.apps import AppConfig

logger = logging.getLogger(__name__)


class PluginsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'core.plugins'
    verbose_name = 'Plugin System'
    
    def ready(self):
        """
        Called when Django is ready.
        Initializes the plugin system.
        """
        try:
            # Discover plugins
            from core.plugins.registry import plugin_registry
            plugin_registry.discover_plugins()
            logger.info(f"Discovered {len(plugin_registry.get_all_plugins())} plugins")
            
            # Initialize plugin tables after a short delay to ensure DB is ready
            from django.db import connection
            from django.db.utils import OperationalError
            
            # Check if we can access the database
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT 1")
                
                # Initialize all plugins
                from core.plugins.initializer import PluginInitializer
                results = PluginInitializer.initialize_all_plugins()
                
                for plugin_name, success in results.items():
                    if success:
                        logger.info(f"✓ Plugin {plugin_name} ready")
                    else:
                        logger.warning(f"✗ Plugin {plugin_name} initialization failed")
                        
            except OperationalError:
                logger.warning("Database not ready yet, skipping plugin initialization")
                # This is normal during migrations
                
        except Exception as e:
            logger.error(f"Error in plugin system ready: {e}", exc_info=True)
