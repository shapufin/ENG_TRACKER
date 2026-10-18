"""Delete audit logs older than the retention window.

The window is ``--days`` if given, else the audit_log plugin's ``retention_days``
config, else 365. It is NOT run automatically (deleting an audit trail is the
operator's decision): schedule it, for example a daily cron running
``python manage.py purge_audit_logs``.
"""
from django.core.management.base import BaseCommand, CommandError

from apps.plugins.models import Plugin
from plugins.audit_log.signals import cleanup_old_logs

DEFAULT_RETENTION_DAYS = 365


class Command(BaseCommand):
    help = 'Delete audit logs older than --days (default: plugin retention_days, else 365).'

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=None)

    def handle(self, *args, **options):
        days = options['days']
        if days is None:
            plugin = Plugin.objects.filter(name='audit_log').first()
            days = (plugin.config or {}).get('retention_days', DEFAULT_RETENTION_DAYS) if plugin else DEFAULT_RETENTION_DAYS
        if not isinstance(days, int) or days < 1:
            raise CommandError('--days must be a positive integer.')
        deleted = cleanup_old_logs(retention_days=days)
        self.stdout.write(f'Purged {deleted} audit log(s) older than {days} days.')
