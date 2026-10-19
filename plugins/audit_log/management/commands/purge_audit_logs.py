"""Delete audit logs older than the retention window.

The window is ``--days`` if given, else the audit_log plugin's ``retention_days``
config, else 365. By default it runs only when invoked. ``--if-configured`` makes
it a no-op unless an admin explicitly set ``retention_days`` on the plugin, so the
boot hook in ``docker/entrypoint.sh`` never deletes an audit trail nobody opted
into. Schedule it, for example a daily cron running
``python manage.py purge_audit_logs --if-configured``.
"""
from django.core.management.base import BaseCommand, CommandError

from apps.plugins.models import Plugin
from plugins.audit_log.signals import cleanup_old_logs

DEFAULT_RETENTION_DAYS = 365


class Command(BaseCommand):
    help = 'Delete audit logs older than --days (default: plugin retention_days, else 365).'

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=None)
        parser.add_argument(
            '--if-configured', action='store_true',
            help='Do nothing unless the plugin config explicitly sets retention_days.',
        )

    def handle(self, *args, **options):
        days = options['days']
        plugin = Plugin.objects.filter(name='audit_log').first()
        configured = (plugin.config or {}).get('retention_days') if plugin else None
        if days is None:
            if options['if_configured'] and configured is None:
                self.stdout.write('No explicit retention_days configured; nothing purged.')
                return
            days = configured if configured is not None else DEFAULT_RETENTION_DAYS
        if not isinstance(days, int) or days < 1:
            raise CommandError('--days must be a positive integer.')
        deleted = cleanup_old_logs(retention_days=days)
        self.stdout.write(f'Purged {deleted} audit log(s) older than {days} days.')
