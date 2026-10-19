"""Delete analytics snapshots and metric points older than the retention window.

The window is ``--days`` if given, else ``AnalyticsConfiguration.data_retention_days``
(the "Data Retention Days" field in the analytics settings), else 365. Daily
buckets are left alone: live trend queries read them. It runs only when invoked
(deleting history is the operator's call); schedule it, for example a daily cron
running ``python manage.py purge_analytics_data``.
"""
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from core.utils.timezone_local import business_today
from plugins.analytics.models import AnalyticsConfiguration, AnalyticsMetric, AnalyticsSnapshot

DEFAULT_RETENTION_DAYS = 365


class Command(BaseCommand):
    help = 'Delete analytics snapshots/metrics older than --days (default: configured retention, else 365).'

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=None)

    def handle(self, *args, **options):
        days = options['days']
        if days is None:
            config = AnalyticsConfiguration.objects.first()
            days = config.data_retention_days if config else DEFAULT_RETENTION_DAYS
        if days < 1:
            raise CommandError('--days must be a positive integer.')
        snapshots, _ = AnalyticsSnapshot.objects.filter(
            snapshot_date__lt=business_today() - timedelta(days=days)
        ).delete()
        metrics, _ = AnalyticsMetric.objects.filter(
            recorded_at__lt=timezone.now() - timedelta(days=days)
        ).delete()
        self.stdout.write(
            f'Purged {snapshots} snapshot(s) and {metrics} metric(s) older than {days} days.'
        )
