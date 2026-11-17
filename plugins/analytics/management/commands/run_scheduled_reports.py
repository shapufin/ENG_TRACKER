"""
Run scheduled analytics reports and email them to recipients.

The scheduler (``run_scheduler``) already runs this hourly through the analytics plugin's
``reports`` job; the command remains for a manual run.
"""

from django.core.management.base import BaseCommand

from plugins.analytics.scheduled_reports import run_due_reports


class Command(BaseCommand):
    help = 'Execute scheduled analytics reports and send via email'

    def handle(self, *args, **options):
        sent = run_due_reports()
        self.stdout.write(self.style.SUCCESS(f'Sent {sent} scheduled report(s).'))
