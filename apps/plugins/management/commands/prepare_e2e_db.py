from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError

from core.plugins.registry import plugin_registry


class Command(BaseCommand):
    help = (
        'Migrate, enable every plugin, and seed the deterministic e2e fixture. '
        'Run BEFORE starting the servers: plugin URLs are computed at startup.'
    )

    def handle(self, *args, **options):
        call_command('migrate', interactive=False, verbosity=0)

        plugin_registry.discover_plugins()
        failed = [
            name for name in sorted(plugin_registry.get_all_plugins())
            if not plugin_registry.activate_plugin(name)
        ]
        if failed:
            raise CommandError(f'Could not activate plugins: {", ".join(failed)}')

        call_command('seed_payroll_rules', verbosity=0)
        call_command('seed_e2e_data', verbosity=0)
        self.stdout.write(self.style.SUCCESS(
            f'Prepared e2e database: {len(plugin_registry.get_all_plugins())} plugins enabled.'
        ))
