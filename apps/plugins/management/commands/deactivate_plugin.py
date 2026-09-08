from django.core.management.base import BaseCommand
from core.plugins.registry import plugin_registry


class Command(BaseCommand):
    help = 'Deactivate a plugin by disabling it in the database (tables are preserved)'

    def add_arguments(self, parser):
        parser.add_argument('plugin_name', type=str, help='Name of the plugin to deactivate')

    def handle(self, *args, **options):
        plugin_name = options['plugin_name']
        self.stdout.write(f'Deactivating plugin: {plugin_name}')

        if plugin_registry.deactivate_plugin(plugin_name):
            self.stdout.write(self.style.SUCCESS(f'Successfully deactivated plugin: {plugin_name}'))
        else:
            self.stdout.write(self.style.ERROR(f'Failed to deactivate plugin: {plugin_name}'))
