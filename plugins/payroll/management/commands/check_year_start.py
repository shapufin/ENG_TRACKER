"""Read-only year-start checklist (audit 2026-11-16 M4).

Run it in November or December for the coming year. It changes nothing and exits
non-zero when something must be fixed before people book leave or payroll is drafted.
"""
from django.core.management.base import BaseCommand, CommandError

from plugins.payroll.services.year_start import year_start_report


class Command(BaseCommand):
    help = 'Read-only checklist for the coming year: holidays, payroll calendar and rule set.'

    def add_arguments(self, parser):
        parser.add_argument('--year', type=int, required=True)

    def handle(self, *args, **options):
        rows = year_start_report(options['year'])
        for status, check, detail in rows:
            self.stdout.write(f'[{status}] {check}: {detail}')
        failed = [r for r in rows if r[0] == 'FAIL']
        if failed:
            raise CommandError(f'{len(failed)} year-start check(s) failed.')
        self.stdout.write('Year-start checks passed.')
