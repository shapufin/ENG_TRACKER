"""Calendar service for the Payroll plugin.

Handles work-calendar generation, month summaries, and Albania 2026
holiday seeding.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
from decimal import Decimal

from ..models import PayrollWorkCalendar, PayrollWorkday

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Albania 2026 public holidays (fixed and observed dates)
# Source: Albanian labour code public holidays. These are the standard
# fixed-date holidays; movable religious holidays are noted separately.
# ---------------------------------------------------------------------------

ALBANIA_2026_HOLIDAYS: dict[date, str] = {
    date(2026, 1, 1): 'New Year\'s Day',
    date(2026, 1, 2): 'New Year\'s Holiday',
    date(2026, 3, 14): 'Summer Day',
    date(2026, 3, 22): 'Nevruz Day',
    date(2026, 5, 1): 'Labour Day',
    date(2026, 6, 29): 'Saint Peter and Paul Day (Catholic)',
    date(2026, 10, 19): 'Mother Teresa Day',
    date(2026, 11, 28): 'Independence Day',
    date(2026, 11, 29): 'Liberation Day',
    date(2026, 12, 8): 'National Youth Day',
    date(2026, 12, 25): 'Christmas Day',
    # Easter dates 2026 (Western Easter: April 5; Orthodox Easter: April 12)
    date(2026, 4, 5): 'Catholic Easter',
    date(2026, 4, 6): 'Catholic Easter Monday',
    date(2026, 4, 12): 'Orthodox Easter',
    date(2026, 4, 13): 'Orthodox Easter Monday',
    # Eid al-Fitr and Eid al-Adha are movable — approximate 2026 dates
    # These should be verified and adjusted by an admin.
    date(2026, 3, 20): 'Eid al-Fitr (approximate)',
    date(2026, 5, 27): 'Eid al-Adha (approximate)',
}


def generate_workdays_for_year(calendar: PayrollWorkCalendar) -> int:
    """Generate or update all 365/366 workday rows for a calendar year.

    Weekdays (Mon–Fri) are marked as working days unless they are a
    known holiday. Weekends (Sat–Sun) are non-working. Holidays from
    ``ALBANIA_2026_HOLIDAYS`` (or equivalent for the year) are applied.

    Returns the number of working days created/updated.
    """
    year = calendar.year
    holidays = _get_holidays_for_year(year)

    start = date(year, 1, 1)
    end = date(year, 12, 31)
    current = start
    working_count = 0

    while current <= end:
        is_weekend = current.weekday() >= 5
        holiday_name = holidays.get(current)
        is_holiday = holiday_name is not None
        is_working = not is_weekend and not is_holiday

        PayrollWorkday.objects.update_or_create(
            calendar=calendar,
            date=current,
            defaults={
                'is_working_day': is_working,
                'is_holiday': is_holiday,
                'holiday_name': holiday_name or '',
                'standard_hours': Decimal('8') if is_working else Decimal('0'),
            },
        )
        if is_working:
            working_count += 1
        current += timedelta(days=1)

    return working_count


def _get_holidays_for_year(year: int) -> dict[date, str]:
    """Return holidays for a given year.

    For 2026, returns the predefined ``ALBANIA_2026_HOLIDAYS``.
    For other years, returns only fixed-date holidays (movable ones
    need manual admin entry).
    """
    if year == 2026:
        return dict(ALBANIA_2026_HOLIDAYS)

    # Fixed-date holidays for any year
    fixed: dict[date, str] = {
        date(year, 1, 1): 'New Year\'s Day',
        date(year, 1, 2): 'New Year\'s Holiday',
        date(year, 3, 14): 'Summer Day',
        date(year, 3, 22): 'Nevruz Day',
        date(year, 5, 1): 'Labour Day',
        date(year, 10, 19): 'Mother Teresa Day',
        date(year, 11, 28): 'Independence Day',
        date(year, 11, 29): 'Liberation Day',
        date(year, 12, 8): 'National Youth Day',
        date(year, 12, 25): 'Christmas Day',
    }
    return fixed


def get_month_summary(calendar: PayrollWorkCalendar, month: int) -> dict:
    """Return working-day summary for a specific month."""
    start = date(calendar.year, month, 1)
    if month == 12:
        end = date(calendar.year, 12, 31)
    else:
        end = date(calendar.year, month + 1, 1) - timedelta(days=1)

    workdays = calendar.workdays.filter(date__gte=start, date__lte=end).order_by('date')
    working = workdays.filter(is_working_day=True)
    holidays = workdays.filter(is_holiday=True)

    return {
        'year': calendar.year,
        'month': month,
        'total_days': (end - start).days + 1,
        'working_days': working.count(),
        'holiday_count': holidays.count(),
        'standard_hours': str(sum((wd.standard_hours for wd in working), Decimal('0'))),
        'holidays': [
            {'date': str(hd.date), 'name': hd.holiday_name}
            for hd in holidays
        ],
    }


def seed_albania_2026() -> PayrollWorkCalendar:
    """Create and seed the Albania 2026 work calendar."""
    calendar, created = PayrollWorkCalendar.objects.get_or_create(
        country='AL', year=2026,
        defaults={'is_active': True, 'source': 'Albanian labour code 2026 (reference)'},
    )
    if created or calendar.workdays.count() == 0:
        generate_workdays_for_year(calendar)
        logger.info('Seeded Albania 2026 work calendar with %d workdays', calendar.workdays.count())
    return calendar


def add_holiday(calendar: PayrollWorkCalendar, holiday_date: date, name: str) -> PayrollWorkday:
    """Add or update a holiday on the given date.

    Sets is_holiday=True, is_working_day=False, holiday_name=name.
    Creates the workday row if it doesn't exist for this date.
    """
    workday, created = PayrollWorkday.objects.update_or_create(
        calendar=calendar,
        date=holiday_date,
        defaults={
            'is_holiday': True,
            'is_working_day': False,
            'holiday_name': name,
            'standard_hours': Decimal('0'),
        },
    )
    if not created:
        logger.info('Updated holiday %s on %s (was: %s)', name, holiday_date, workday.holiday_name)
    return workday


def remove_holiday(workday: PayrollWorkday) -> None:
    """Remove holiday status from a workday.

    Restores is_working_day based on weekday (Mon-Fri = working).
    Clears holiday_name and restores standard_hours if it's a working day.
    """
    is_weekend = workday.date.weekday() >= 5
    workday.is_holiday = False
    workday.holiday_name = ''
    workday.is_working_day = not is_weekend
    workday.standard_hours = Decimal('8') if not is_weekend else Decimal('0')
    workday.save(update_fields=['is_holiday', 'holiday_name', 'is_working_day', 'standard_hours'])
