"""
Management command to ensure all plugin tables exist.
Automatically creates migrations and applies them.
"""

from django.core.management.base import BaseCommand
from django.core.management import call_command
from core.plugins.initializer import PluginInitializer, PluginTableManager
from core.plugins.registry import plugin_registry
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Ensure all plugin tables exist in the database (auto-creates migrations)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--plugin',
            type=str,
            help='Initialize a specific plugin by name',
        )
        parser.add_argument(
            '--list',
            action='store_true',
            help='List all discovered plugins and their status',
        )
        parser.add_argument(
            '--skip-migrations',
            action='store_true',
            help='Skip automatic migration creation',
        )

    def handle(self, *args, **options):
        if not options['skip_migrations']:
            self.create_migrations()
            self.apply_migrations()
        
        if options['list']:
            self.list_plugins()
        elif options['plugin']:
            self.initialize_plugin(options['plugin'])
        else:
            self.initialize_all()

    def create_migrations(self):
        """Create migrations for all plugins."""
        self.stdout.write(self.style.SUCCESS('Creating migrations for plugins...'))
        
        plugins = plugin_registry.get_all_plugins()
        for plugin_name in plugins.keys():
            try:
                # Use just the plugin name as app label
                call_command('makemigrations', plugin_name, verbosity=0)
                self.stdout.write(self.style.SUCCESS(f'✓ Migrations created for {plugin_name}'))
            except Exception as e:
                # It's ok if no migrations needed
                logger.debug(f"No migrations needed for {plugin_name}: {e}")
    
    def apply_migrations(self):
        """Apply migrations for all plugins."""
        self.stdout.write(self.style.SUCCESS('Applying migrations...'))
        
        plugins = plugin_registry.get_all_plugins()
        for plugin_name in plugins.keys():
            try:
                # Use just the plugin name as app label
                call_command('migrate', plugin_name, verbosity=0)
                self.stdout.write(self.style.SUCCESS(f'✓ Migrations applied for {plugin_name}'))
            except Exception as e:
                logger.warning(f"Failed to apply migrations for {plugin_name}: {e}")

    def initialize_all(self):
        """Initialize all plugins."""
        self.stdout.write(self.style.SUCCESS('Initializing all plugins...'))
        
        results = PluginInitializer.initialize_all_plugins()
        
        success_count = sum(1 for v in results.values() if v)
        total_count = len(results)
        
        for plugin_name, success in results.items():
            if success:
                self.stdout.write(
                    self.style.SUCCESS(f'✓ {plugin_name}')
                )
            else:
                self.stdout.write(
                    self.style.ERROR(f'✗ {plugin_name}')
                )
        
        self.stdout.write(
            self.style.SUCCESS(f'\nInitialized {success_count}/{total_count} plugins')
        )

    def initialize_plugin(self, plugin_name):
        """Initialize a specific plugin."""
        self.stdout.write(f'Initializing plugin: {plugin_name}')
        
        success = PluginTableManager.ensure_plugin_tables(plugin_name)
        
        if success:
            tables = PluginTableManager.get_plugin_tables(plugin_name)
            self.stdout.write(
                self.style.SUCCESS(f'✓ Plugin {plugin_name} initialized')
            )
            self.stdout.write(f'  Tables: {", ".join(tables) if tables else "None"}')
        else:
            self.stdout.write(
                self.style.ERROR(f'✗ Failed to initialize plugin {plugin_name}')
            )

    def list_plugins(self):
        """List all discovered plugins and their status."""
        plugins = plugin_registry.get_all_plugins()
        
        if not plugins:
            self.stdout.write(self.style.WARNING('No plugins discovered'))
            return
        
        self.stdout.write(self.style.SUCCESS('Discovered Plugins:'))
        self.stdout.write('-' * 60)
        
        for plugin_name, plugin_instance in plugins.items():
            tables_exist = PluginTableManager.plugin_tables_exist(plugin_name)
            tables = PluginTableManager.get_plugin_tables(plugin_name)
            
            status = self.style.SUCCESS('✓ Installed') if tables_exist else self.style.WARNING('✗ Not Installed')
            
            self.stdout.write(f'\n{plugin_name}')
            self.stdout.write(f'  Status: {status}')
            self.stdout.write(f'  Version: {plugin_instance.version}')
            self.stdout.write(f'  Description: {plugin_instance.description}')
            if tables:
                self.stdout.write(f'  Tables: {", ".join(tables)}')
