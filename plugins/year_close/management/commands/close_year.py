"""Build (or retry) a year's frozen evidence set.

There is no API for this: closing a year is a deliberate operation, and the
scheduler calls the same service hourly once the year is eligible.
"""
from django.core.management.base import BaseCommand, CommandError

from core.utils.timezone_local import business_today
from plugins.year_close.services.closer import close_year


class Command(BaseCommand):
    help = (
        'Build the frozen evidence set for a year and freeze it. Idempotent: a ready '
        'year is left alone. --retry rebuilds only the files that failed.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--year',
            type=int,
            help='Year to close (default: last year). Older years must be named explicitly.',
        )
        parser.add_argument(
            '--retry',
            action='store_true',
            help='Rebuild only the files that failed in the last attempt.',
        )

    def handle(self, *args, **options):
        year = options['year'] or business_today().year - 1
        if options['year'] and year >= business_today().year:
            raise CommandError(
                f'{year} is not a past year; only a finished year can be closed.'
            )

        snapshot = close_year(year, retry=options['retry'])
        self.stdout.write(f'Year {year} v{snapshot.version}: {snapshot.status}')

        readiness = snapshot.readiness or {}
        for blocker in readiness.get('blockers', []):
            self.stdout.write(self.style.WARNING(f'  blocked: {blocker}'))
        for warning in readiness.get('warnings', []):
            self.stdout.write(f'  warning: {warning}')
        if readiness.get('error'):
            self.stdout.write(self.style.ERROR(f'  {readiness["error"]}'))

        failed = snapshot.files.exclude(status='ready')
        for row in failed:
            self.stdout.write(self.style.ERROR(f'  failed: {row.relative_path}: {row.error}'))

        if snapshot.status == 'ready':
            self.stdout.write(self.style.SUCCESS(
                f'  {snapshot.files.count()} files, {snapshot.total_bytes} bytes, '
                f'{snapshot.year}/MANIFEST.json written.'
            ))
        elif snapshot.status == 'failed':
            raise CommandError('The snapshot set is incomplete; see the failures above.')
