from django.core.management.base import BaseCommand

from apps.plugins.services.registry_sync import sync_plugin_registry


class Command(BaseCommand):
    help = 'Register discovered plugins in the Plugin table (does not enable them)'

    def handle(self, *args, **options):
        synced = sync_plugin_registry()
        self.stdout.write(self.style.SUCCESS(f'Synced {len(synced)} plugins'))
