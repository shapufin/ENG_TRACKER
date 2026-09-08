from django.core.management.base import BaseCommand
from core.plugins.registry import plugin_registry


class Command(BaseCommand):
    help = 'Uninstall a plugin by dropping its database tables (WARNING: deletes all data)'

    def add_arguments(self, parser):
        parser.add_argument('plugin_name', type=str, help='Name of the plugin to uninstall')
        parser.add_argument(
            '--backup-data',
            action='store_true',
            help='Export plugin data to JSON before dropping tables'
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Skip confirmation prompt'
        )

    def handle(self, *args, **options):
        plugin_name = options['plugin_name']
        backup_data = options['backup_data']
        force = options['force']

        if not force:
            confirm = input(f'Are you sure you want to uninstall plugin "{plugin_name}"? This will delete all plugin data. Type "yes" to confirm: ')
            if confirm.lower() != 'yes':
                self.stdout.write(self.style.WARNING('Uninstall cancelled'))
                return

        self.stdout.write(f'Uninstalling plugin: {plugin_name}')

        if plugin_registry.uninstall_plugin(plugin_name, backup_data=backup_data):
            self.stdout.write(self.style.SUCCESS(f'Successfully uninstalled plugin: {plugin_name}'))
        else:
            self.stdout.write(self.style.ERROR(f'Failed to uninstall plugin: {plugin_name}'))
