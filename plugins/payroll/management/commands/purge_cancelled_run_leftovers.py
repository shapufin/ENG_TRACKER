"""One-shot cleanup of lines and draft inclusion rows kept by runs cancelled
before ``cancel_run`` removed them. Safe to repeat; touches cancelled runs only."""
from django.core.management.base import BaseCommand

from plugins.payroll.services.payroll_service import purge_cancelled_run_leftovers


class Command(BaseCommand):
    help = 'Delete lines and draft source entries left behind by cancelled payroll runs.'

    def handle(self, *args, **options):
        removed = purge_cancelled_run_leftovers()
        self.stdout.write(
            f"Removed {removed['entries']} draft entr(y/ies) and {removed['lines']} row(s) "
            'from lines of cancelled runs.'
        )
