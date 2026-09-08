"""
Management command to seed plugin permissions.

Creates default plugin permissions for all discovered plugins.
By default, all plugins are admin-only (no roles/groups assigned).
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from apps.plugins.models import PluginPermission
from core.plugins.registry import plugin_registry
from apps.plugins.services.permission_manifest import sync_plugin_permission_manifest
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Seed plugin permissions for all discovered plugins'

    def add_arguments(self, parser):
        parser.add_argument(
            '--reset',
            action='store_true',
            help='Reset all plugin permissions before seeding',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        reset = options.get('reset', False)
        
        if reset:
            self.stdout.write(self.style.WARNING('Resetting all plugin permissions...'))
            PluginPermission.objects.all().delete()
            self.stdout.write(self.style.SUCCESS('[OK] Plugin permissions reset'))
        
        # Get all discovered plugins
        plugins = plugin_registry.get_all_plugins()
        
        if not plugins:
            self.stdout.write(self.style.WARNING('No plugins discovered'))
            return
        
        self.stdout.write(self.style.SUCCESS(f'Seeding permissions for {len(plugins)} plugins...'))
        
        created_count = 0
        updated_count = 0
        skipped_count = 0

        for plugin_name, plugin in plugins.items():
            try:
                result = sync_plugin_permission_manifest(plugin, reset=reset)
                created_count += result['created']
                updated_count += result['updated']
                if result['created']:
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"[OK] {plugin_name}: {result['created']} permission rows created"
                        )
                    )
                else:
                    skipped_count += 4 - result['updated']
            except ValueError as exc:
                self.stdout.write(self.style.ERROR(f'[ERR] {plugin_name}: {exc}'))
                logger.error('Invalid permission manifest for %s: %s', plugin_name, exc)
                raise
            except Exception as exc:
                self.stdout.write(self.style.ERROR(f'[ERR] Failed to seed {plugin_name}: {exc}'))
                logger.exception('Failed to seed permissions for %s', plugin_name)
                raise

        self.stdout.write(
            self.style.SUCCESS(
                f'\n[OK] Seeding complete: {created_count} created, '
                f'{updated_count} reset, {skipped_count} preserved'
            )
        )
