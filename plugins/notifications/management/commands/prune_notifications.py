"""Delete READ notifications older than the retention window (default 180 days).

Unread notifications are never pruned, however old. There is no scheduler in
this deployment, so ``docker/entrypoint.sh`` runs this on boot; on a
long-running replica schedule it too (for example a daily cron:
``python manage.py prune_notifications``).
"""
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from plugins.notifications.models import Notification

DEFAULT_RETENTION_DAYS = 180
DEFAULT_BATCH_SIZE = 5000


class Command(BaseCommand):
    help = 'Delete read notifications older than --days (default 180). Unread are kept.'

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=DEFAULT_RETENTION_DAYS)
        parser.add_argument('--batch-size', type=int, default=DEFAULT_BATCH_SIZE)

    def handle(self, *args, **options):
        days = options['days']
        if days < 1:
            raise CommandError('--days must be a positive integer.')
        batch_size = options['batch_size']
        if batch_size < 1:
            raise CommandError('--batch-size must be a positive integer.')
        cutoff = timezone.now() - timedelta(days=days)
        stale = Notification.objects.filter(is_read=True, created_at__lt=cutoff)
        deleted = 0
        while True:
            pks = list(stale.values_list('pk', flat=True)[:batch_size])
            if not pks:
                break
            deleted += Notification.objects.filter(pk__in=pks).delete()[0]
        self.stdout.write(f'Pruned {deleted} read notification(s) older than {days} days.')
