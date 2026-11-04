"""Close a month for every user a TL has not closed, once its cutoff passed.

The month's cutoff is 00:00 on the 2nd of the following month (Europe/Tirane).
Before it this does nothing, so it is safe to run from cron or by hand at any
time. Payroll also sweeps its own run's users when HR finalizes, so this
command is for closing the whole company ahead of time.
"""
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError

from apps.users.services.approval_periods import (
    auto_finalize_approval_periods,
    normalize_period,
)
from core.utils.timezone_local import business_today


class Command(BaseCommand):
    help = 'Auto-finalize unclosed approval periods once the month cutoff has passed.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--period',
            help='Any date in the month to close (YYYY-MM-DD). Default: the previous month.',
        )

    def handle(self, *args, **options):
        if options['period']:
            try:
                period = normalize_period(options['period'])
            except ValueError as exc:
                raise CommandError(f'Invalid --period: {exc}') from exc
        else:
            period = normalize_period(business_today().replace(day=1) - timedelta(days=1))

        close, count = auto_finalize_approval_periods(period)
        if close is None:
            self.stdout.write(f'{period:%Y-%m}: cutoff not reached, nothing to do.')
        else:
            self.stdout.write(f'{period:%Y-%m}: auto-finalized {count} user(s).')
