"""Year-start checklist and the weekly notice built on it (audit 2026-11-16 M4)."""
import logging
from datetime import date

from apps.leave_management.models.core import global_holiday_dates
from core.utils.timezone_local import business_today
from plugins.payroll.models import PayrollConfiguration, PayrollRuleSet, PayrollWorkCalendar

logger = logging.getLogger(__name__)

# The notice starts on 1 November: people book January leave and the first draft needs the calendar.
NOTICE_FROM_MONTH = 11


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


def year_start_notice_tick(today=None) -> int:
    """Tell HR and administrators what next year still lacks. Returns notices created.

    Runs daily from the scheduler, does nothing before 1 November or when every check passes, and
    the notification's dedupe key makes it one reminder per ISO week, not one per run.
    """
    today = today or business_today()
    if today.month < NOTICE_FROM_MONTH:
        return 0
    year = today.year + 1
    failures = [(check, detail) for status, check, detail in year_start_report(year) if status == 'FAIL']
    if not failures:
        return 0
    try:
        from plugins.notifications.models import Notification
        from plugins.notifications.types.hr_period import HrYearStartNotification
    except ImportError:  # notifications plugin not installed
        return 0
    before = Notification.objects.filter(dedupe_key__startswith='hr-year-start:').count()
    HrYearStartNotification().dispatch({'year': year, 'failures': failures, 'today': today})
    return Notification.objects.filter(dedupe_key__startswith='hr-year-start:').count() - before
