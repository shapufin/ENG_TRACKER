"""Headless version of the Archives purge: a dry run by default.

    manage.py purge_expired_years                      # report what is eligible
    manage.py purge_expired_years --apply --confirm PURGE-ARCHIVED-YEARS

Every gate of the Archives page applies (closed year, verified files, removal date,
final notice at least 30 days ago). Nothing runs it on a schedule.
"""
from django.core.management.base import BaseCommand, CommandError

from plugins.year_close.models import YearSnapshot
from plugins.year_close.services import retention

CONFIRM_PHRASE = 'PURGE-ARCHIVED-YEARS'


class Command(BaseCommand):
    help = 'Remove archived data past its retention date (dry run unless --apply).'

    def add_arguments(self, parser):
        parser.add_argument('--year', type=int, help='Only this year.')
        parser.add_argument('--category', choices=retention.KEYS, help='Only this category.')
        parser.add_argument('--apply', action='store_true', help='Actually delete.')
        parser.add_argument('--confirm', default='', help=f'Required with --apply: {CONFIRM_PHRASE}')

    def handle(self, *args, **options):
        apply = options['apply']
        if apply and options['confirm'] != CONFIRM_PHRASE:
            raise CommandError(f'--apply needs --confirm {CONFIRM_PHRASE}.')
        years = sorted(set(
            YearSnapshot.objects.filter(status='ready').values_list('year', flat=True)
        ))
        if options['year']:
            years = [y for y in years if y == options['year']]
        keys = [options['category']] if options['category'] else retention.KEYS
        for year in years:
            for key in keys:
                try:
                    result = retention.purge(year, key, dry_run=not apply)
                except retention.PurgeRefused as refused:
                    self.stdout.write(f'{year} {key}: skipped - {"; ".join(refused.reasons)}')
                    continue
                verb = 'removed' if apply else 'would remove'
                self.stdout.write(f'{year} {key}: {verb} {result["rows"]}')
