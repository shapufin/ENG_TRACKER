from django.core.management.base import BaseCommand
from core.plugins.registry import plugin_registry


class Command(BaseCommand):
    help = 'Activate a plugin by creating its database tables'

    def add_arguments(self, parser):
        parser.add_argument('plugin_name', type=str, help='Name of the plugin to activate')

    def handle(self, *args, **options):
        plugin_name = options['plugin_name']
        self.stdout.write(f'Activating plugin: {plugin_name}')

        if plugin_registry.activate_plugin(plugin_name):
            self.stdout.write(self.style.SUCCESS(f'Successfully activated plugin: {plugin_name}'))
        else:
            self.stdout.write(self.style.ERROR(f'Failed to activate plugin: {plugin_name}'))
