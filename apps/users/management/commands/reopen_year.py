"""Unfreeze a closed year (year-close plan Y2).

Closing a year is automatic; reopening one is a deliberate, audited override,
so it is a management command rather than an API endpoint. Shell/superuser only.
"""

from django.core.management.base import BaseCommand, CommandError
from rest_framework.exceptions import ValidationError  # what reopen_year raises

from apps.users.models import ClosedYear
from apps.users.services.approval_periods import reopen_year


class Command(BaseCommand):
    help = (
        'Remove the closed-year lock for a year so its overtime and standby records '
        'can be edited again. Audited: a reason is required.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--year', type=int, required=True, help='Calendar year to reopen.')
        parser.add_argument(
            '--reason',
            required=True,
            help='Why the year is being reopened. Stored in the audit log.',
        )

    def handle(self, *args, **options):
        year = options['year']
        reason = options['reason'].strip()
        if not ClosedYear.objects.filter(year=year).exists():
            raise CommandError(f'{year} is not closed; nothing to reopen.')
        try:
            reopen_year(year, reason=reason)
        except ValidationError as exc:
            raise CommandError(' '.join(str(item) for item in exc.detail)) from exc
        self.stdout.write(self.style.SUCCESS(f'Reopened {year}: its records are editable again.'))
        self.stdout.write(
            'The archive set of this year (if one exists) is superseded the next time the '
            'year-close job runs (hourly), which then builds and freezes a new version. '
            'Run `manage.py close_year --year %d` to do it now.' % year
        )
