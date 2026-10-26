"""Unfreeze a closed year (year-close plan Y2).

Closing a year is automatic; reopening one is a deliberate, audited override,
so it is a management command rather than an API endpoint. Shell/superuser only.
"""

from django.core.management.base import BaseCommand, CommandError
from django.core.exceptions import ValidationError

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
            raise CommandError(str(exc)) from exc
        self.stdout.write(self.style.SUCCESS(f'Reopened {year}: its records are editable again.'))
        self.stdout.write(
            'The year-close snapshot (if one exists) is superseded; the next close builds a new version.'
        )
