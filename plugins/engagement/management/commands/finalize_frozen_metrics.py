"""
Give every engagement snapshot past the metrics freeze its one final recompute.

Usage:
    python manage.py finalize_frozen_metrics
    python manage.py finalize_frozen_metrics --dry-run

Reads already do this lazily; run it once after deploying the freeze and from cron
as a safety net. Idempotent: a final snapshot is never touched again.
"""
from django.core.management.base import BaseCommand

from plugins.engagement.services import finalize_frozen_snapshots


class Command(BaseCommand):
    help = 'Recompute, once, the engagement snapshots whose month is past the metrics freeze.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Only count what would be finalized.')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        count = finalize_frozen_snapshots(dry_run=dry_run)
        verb = 'Would finalize' if dry_run else 'Finalized'
        self.stdout.write(self.style.SUCCESS(f'{verb} {count} snapshot(s).'))
