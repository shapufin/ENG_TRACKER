"""Management command to seed the Albania 2026 payroll work calendar."""
from django.core.management.base import BaseCommand

from plugins.payroll.services.calendar_service import seed_albania_2026


class Command(BaseCommand):
    help = 'Seed the Albania 2026 payroll work calendar with holidays and working days.'

    def handle(self, *args, **options):
        calendar = seed_albania_2026()
        workday_count = calendar.workdays.filter(is_working_day=True).count()
        holiday_count = calendar.workdays.filter(is_holiday=True).count()
        self.stdout.write(
            self.style.SUCCESS(
                f'Seeded Albania {calendar.year} work calendar: '
                f'{workday_count} working days, {holiday_count} holidays.'
            )
        )
