"""
Freeze each team leader's month-bound scorecard blocks once the month is past the metrics freeze.

Usage:
    python manage.py freeze_scorecard_months                      # latest frozen month
    python manage.py freeze_scorecard_months --month 2026-09-01   # backfill a chosen month

The scheduler runs the default form hourly. A backfilled older month reflects TODAY's
membership, not the month's: there is no earlier truth to recover.
"""
from datetime import date

from django.core.management.base import BaseCommand, CommandError

from plugins.tl_scorecard.snapshots import freeze_scorecard_months


class Command(BaseCommand):
    help = "Snapshot each team leader's frozen scorecard blocks."

    def add_arguments(self, parser):
        parser.add_argument('--month', type=str, help='ISO date within the month to snapshot (must be past its freeze).')

    def handle(self, *args, **options):
        month = None
        if options.get('month'):
            try:
                month = date.fromisoformat(options['month'])
            except ValueError:
                raise CommandError('--month must be an ISO date (YYYY-MM-DD)')
        try:
            written = freeze_scorecard_months(month=month)
        except ValueError as exc:
            raise CommandError(str(exc))
        self.stdout.write(self.style.SUCCESS(f'Snapshotted {written} leader(s).'))
