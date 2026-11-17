from datetime import date

from django.core.management.base import BaseCommand, CommandError

from apps.leave_management.services.holiday_recount import recount_leave_days


def _day(value):
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise CommandError(f'Not a date (YYYY-MM-DD): {value}') from exc


class Command(BaseCommand):
    help = (
        "Recount open vacation requests that have not ended yet after a holiday change. "
        "Dry run unless --apply is given. The same recount runs automatically when a "
        "global public holiday is saved or deleted."
    )

    def add_arguments(self, parser):
        parser.add_argument('--from', dest='date_from', help='Only requests ending on or after this date')
        parser.add_argument('--to', dest='date_to', help='Only requests starting on or before this date')
        parser.add_argument('--apply', action='store_true', help='Write the changes (default is a dry run)')

    def handle(self, *args, **options):
        date_from = _day(options['date_from']) if options['date_from'] else None
        date_to = _day(options['date_to']) if options['date_to'] else None
        changes = recount_leave_days(date_from, date_to, apply=options['apply'])
        for c in changes:
            self.stdout.write(
                f'request {c.request_id} user {c.user_id} {c.status} {c.start_date}..{c.end_date}: '
                f'{c.old_days} -> {c.new_days}'
            )
        mode = 'Applied' if options['apply'] else 'Dry run (use --apply to write)'
        self.stdout.write(f'{mode}: {len(changes)} request(s) change.')
