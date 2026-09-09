"""
Plugin initialization and table management system.
Ensures all plugin tables exist before operations and handles missing tables gracefully.
"""

import logging
from django.db import connection
from django.core.management import call_command
from typing import List, Dict, Set

logger = logging.getLogger(__name__)


class PluginTableManager:
    """Manages plugin database tables with graceful error handling."""
    
    @staticmethod
    def get_existing_tables() -> Set[str]:
        """Get all existing table names in the database."""
        try:
            with connection.cursor() as cursor:
                if connection.vendor == 'sqlite':
                    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
                elif connection.vendor == 'postgresql':
                    cursor.execute(
                        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
                    )
                elif connection.vendor == 'mysql':
                    cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()")
                else:
                    return set()
                
                return {row[0] for row in cursor.fetchall()}
        except Exception as e:
            logger.error(f"Failed to get existing tables: {e}")
            return set()
    
    @staticmethod
    def ensure_plugin_tables(plugin_name: str) -> bool:
        """
        Ensure plugin tables exist. Creates them if missing.
        Returns True if tables exist or were created, False if failed.
        """
        try:
            logger.info(f"Ensuring tables for plugin: {plugin_name}")
            
            # Check if tables already exist
            if PluginTableManager.plugin_tables_exist(plugin_name):
                logger.info(f"Plugin {plugin_name} tables already exist")
                return True
            
            # Try to create tables using Django's migration system
            try:
                # Use just the plugin name as app label (not plugins.{name})
                call_command('migrate', plugin_name, verbosity=0)
                logger.info(f"Plugin {plugin_name} tables created via migrate")
                return True
            except Exception as migrate_error:
                error_msg = str(migrate_error)
                # If table already exists, that's ok
                if 'already exists' in error_msg:
                    logger.info(f"Plugin {plugin_name} tables already exist (from migrate)")
                    return True
                
                logger.warning(f"Migrate failed for {plugin_name}: {migrate_error}")
                
                # Fallback: try run_syncdb
                try:
                    call_command('migrate', plugin_name, run_syncdb=True, verbosity=0)
                    logger.info(f"Plugin {plugin_name} tables created via run_syncdb")
                    return True
                except Exception as syncdb_error:
                    logger.warning(f"run_syncdb failed for {plugin_name}: {syncdb_error}")
                    # Final check: tables might exist anyway
                    if PluginTableManager.plugin_tables_exist(plugin_name):
                        logger.info(f"Plugin {plugin_name} tables exist despite errors")
                        return True
                    return False
        except Exception as e:
            logger.error(f"Failed to ensure tables for {plugin_name}: {e}")
            return False
    
    @staticmethod
    def get_plugin_tables(plugin_name: str) -> List[str]:
        """Get all table names for a specific plugin."""
        try:
            existing_tables = PluginTableManager.get_existing_tables()
            
            # Pattern: {plugin_name}_* (tables created by Django migrations)
            # Examples: analytics_analyticsmetric, budget_budget, audit_log_auditlog
            pattern = f"{plugin_name}_"
            plugin_tables = [t for t in existing_tables if t.startswith(pattern)]
            
            return plugin_tables
        except Exception as e:
            logger.error(f"Failed to get tables for {plugin_name}: {e}")
            return []
    
    @staticmethod
    def plugin_tables_exist(plugin_name: str) -> bool:
        """Check if plugin has any tables in the database."""
        tables = PluginTableManager.get_plugin_tables(plugin_name)
        return len(tables) > 0
    
    @staticmethod
    def drop_plugin_tables(plugin_name: str, backup_first: bool = False) -> bool:
        """Drop all tables for a plugin."""
        try:
            if backup_first:
                PluginTableManager.backup_plugin_data(plugin_name)
            
            tables = PluginTableManager.get_plugin_tables(plugin_name)

            if not tables:
                logger.info(f"No tables found for plugin {plugin_name}")
                return True

            # Defense-in-depth: only drop tables that are still present in a
            # fresh introspection pass and belong to this plugin's prefix.
            # `tables` already comes from introspection, but re-validating
            # here means a future caller can never smuggle an arbitrary
            # table name into this method and have it reach raw SQL.
            existing_tables = PluginTableManager.get_existing_tables()
            pattern = f"{plugin_name}_"
            safe_tables = [
                t for t in tables
                if t in existing_tables and t.startswith(pattern)
            ]

            with connection.cursor() as cursor:
                for table in safe_tables:
                    quoted_table = connection.ops.quote_name(table)
                    try:
                        if connection.vendor == 'sqlite':
                            cursor.execute(f"DROP TABLE IF EXISTS {quoted_table}")
                        else:
                            cursor.execute(f"DROP TABLE IF EXISTS {quoted_table} CASCADE")
                        logger.info(f"Dropped table: {table}")
                    except Exception as e:
                        logger.error(f"Failed to drop table {table}: {e}")
                        return False
            
            return True
        except Exception as e:
            logger.error(f"Failed to drop tables for {plugin_name}: {e}")
            return False
    
    @staticmethod
    def backup_plugin_data(plugin_name: str) -> bool:
        """Backup plugin data to JSON file."""
        try:
            from django.core.management import call_command
            filename = f'plugins/{plugin_name}_backup.json'
            call_command('dumpdata', f'plugins.{plugin_name}', indent=2, output=filename)
            logger.info(f"Backed up plugin {plugin_name} to {filename}")
            return True
        except Exception as e:
            logger.error(f"Failed to backup plugin {plugin_name}: {e}")
            return False


class PluginInitializer:
    """Initializes plugins safely on startup."""
    
    @staticmethod
    def initialize_all_plugins() -> Dict[str, bool]:
        """
        Initialize all plugins by ensuring their tables exist.
        Returns dict of {plugin_name: success_bool}
        """
        from core.plugins.registry import plugin_registry
        
        results = {}
        plugins = plugin_registry.get_all_plugins()
        
        for plugin_name, plugin_instance in plugins.items():
            try:
                # Check if plugin is enabled
                from apps.plugins.models import Plugin
                plugin_record = Plugin.objects.filter(name=plugin_name).first()
                
                if not plugin_record or not plugin_record.is_enabled:
                    logger.info(f"Plugin {plugin_name} is disabled, skipping initialization")
                    results[plugin_name] = True
                    continue
                
                # Ensure tables exist
                success = PluginTableManager.ensure_plugin_tables(plugin_name)
                results[plugin_name] = success
                
                if success:
                    try:
                        from apps.plugins.services.permission_manifest import sync_plugin_permission_manifest
                        sync_plugin_permission_manifest(plugin_instance)
                        plugin_instance.ready()
                        logger.info(f"Plugin {plugin_name} initialized successfully")
                    except Exception as ready_error:
                        logger.error(
                            f"Plugin {plugin_name} ready hook failed: {ready_error}",
                            exc_info=True,
                        )
                        results[plugin_name] = False
                else:
                    logger.warning(f"Plugin {plugin_name} initialization failed")
                    
            except Exception as e:
                logger.error(f"Error initializing plugin {plugin_name}: {e}")
                results[plugin_name] = False
        
        return results


class SafePluginQuery:
    """Wrapper for safe plugin queries that handle missing tables."""
    
    @staticmethod
    def safe_query(plugin_name: str, model_class, query_func):
        """
        Execute a query safely, returning empty result if table doesn't exist.
        
        Usage:
            result = SafePluginQuery.safe_query(
                'budget',
                Budget,
                lambda: Budget.objects.all()
            )
        """
        try:
            # Check if tables exist first
            if not PluginTableManager.plugin_tables_exist(plugin_name):
                logger.warning(f"Plugin {plugin_name} tables don't exist, returning empty result")
                return model_class.objects.none()
            
            # Execute query
            return query_func()
        except Exception as e:
            logger.error(f"Error querying plugin {plugin_name}: {e}")
            return model_class.objects.none()
    
    @staticmethod
    def safe_get_or_none(plugin_name: str, model_class, **kwargs):
        """Safely get a single object, returning None if table doesn't exist."""
        try:
            if not PluginTableManager.plugin_tables_exist(plugin_name):
                return None
            
            return model_class.objects.filter(**kwargs).first()
        except Exception as e:
            logger.error(f"Error getting object from plugin {plugin_name}: {e}")
            return None
    
    @staticmethod
    def safe_create(plugin_name: str, model_class, **kwargs):
        """Safely create an object, returning None if table doesn't exist."""
        try:
            if not PluginTableManager.plugin_tables_exist(plugin_name):
                logger.warning(f"Plugin {plugin_name} tables don't exist, cannot create object")
                return None
            
            return model_class.objects.create(**kwargs)
        except Exception as e:
            logger.error(f"Error creating object in plugin {plugin_name}: {e}")
            return None
