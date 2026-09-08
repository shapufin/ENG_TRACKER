"""
Delete old completed/failed export jobs and their files from disk.

Usage:
    python manage.py cleanup_export_jobs --days 7

Recommended cron: daily at 3 AM.
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from plugins.analytics.models import ExportJob
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Delete old export jobs and their files from disk'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=7,
            help='Delete jobs older than this many days (default: 7)',
        )

    def handle(self, *args, **options):
        days = options['days']
        cutoff = timezone.now() - timedelta(days=days)

        old_jobs = ExportJob.objects.filter(created_at__lt=cutoff)
        count = old_jobs.count()

        if count == 0:
            self.stdout.write("No old export jobs to clean up.")
            return

        # post_delete signal handles file deletion
        deleted_count, _ = old_jobs.delete()
        self.stdout.write(self.style.SUCCESS(
            f"Cleaned up {count} export jobs older than {days} days."
        ))
