"""Read-only year-start checklist (audit 2026-11-16 M4).

Run it in November or December for the coming year. It changes nothing and exits
non-zero when something must be fixed before people book leave or payroll is drafted.
"""
from datetime import date

from django.core.management.base import BaseCommand, CommandError

from apps.leave_management.models.core import global_holiday_dates
from plugins.payroll.models import PayrollConfiguration, PayrollRuleSet, PayrollWorkCalendar


def year_start_report(year: int) -> list[tuple[str, str, str]]:
    """(status, check, detail) rows; status is OK, FAIL or INFO."""
    rows = []
    holidays = global_holiday_dates(date(year, 1, 1), date(year, 12, 31))
    if holidays:
        rows.append(('OK', 'Public holidays', f'{len(holidays)} global holiday(s) defined for {year}.'))
    else:
        rows.append(('FAIL', 'Public holidays', f'No global public holidays for {year}. Add them in HR > Holidays; '
                     'leave booked before they exist is recounted automatically afterwards.'))

    config = PayrollConfiguration.get_singleton()
    calendar = PayrollWorkCalendar.objects.filter(country=config.country, year=year, is_active=True).first()
    if calendar is None:
        rows.append(('FAIL', 'Payroll work calendar', f'No active {config.country} work calendar for {year}. '
                     'Create or seed it before the first payroll draft of the year.'))
    else:
        marked = set(calendar.workdays.filter(is_holiday=True, date__year=year).values_list('date', flat=True))
        missing = sorted(holidays - marked)
        if missing:
            rows.append(('FAIL', 'Payroll work calendar', 'Not marked as holiday: '
                         + ', '.join(d.isoformat() for d in missing) + '. Run `manage.py sync_payroll_holidays`.'))
        else:
            rows.append(('OK', 'Payroll work calendar', f'Active {calendar.country} calendar marks every holiday.'))

    if PayrollRuleSet.resolve_for_date(date(year, 1, 1), config.default_tax_profile) is None:
        rows.append(('FAIL', 'Payroll rule set', f'No active rule set effective on {year}-01-01.'))
    else:
        rows.append(('OK', 'Payroll rule set', f'A rule set is effective on {year}-01-01.'))

    from apps.leave_management.services.carry_over import _settings
    applied = _settings().carry_over_applied_year
    rows.append(('INFO', 'Leave carry-over', f'Last applied for {applied}. It rolls over on the first leave read '
                 f'of {year}; nothing to do beforehand.'))
    return rows


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
