"""Backfill global HR holidays from Payroll work calendars and mirror them back.

Idempotent. Runs once per deploy from ``docker/entrypoint.sh`` (not from
``AppConfig.ready()``, which would hit the database in every worker).
"""
from django.core.management.base import BaseCommand

from apps.dashboard.services.holiday_sync import sync_holidays_between_hr_and_payroll


class Command(BaseCommand):
    help = 'Synchronise HR public holidays with Payroll work calendars.'

    def add_arguments(self, parser):
        parser.add_argument('--year', type=int, default=None)

    def handle(self, *args, **options):
        self.stdout.write(str(sync_holidays_between_hr_and_payroll(year=options['year'])))
