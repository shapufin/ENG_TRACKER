"""Working days (Mon-Fri minus global public holidays) and the payroll month dates.

One definition for the dates the payroll lifecycle runs on: the last working
day of a month (draft run) and the submission cutoff (day 2 of the next month,
postponed to the next working day). Holidays come from the same source as
leave counting (``global_holiday_dates``: ``calendar IS NULL``, not deleted).
"""
from __future__ import annotations

from calendar import monthrange
from datetime import date, timedelta

# A weekend plus a long holiday run never exceeds this; the bound only guards
# against an unbounded loop if the holiday table holds a pathological range.
_MAX_SPAN_DAYS = 31


def _holidays(start: date, end: date) -> set[date]:
    from apps.leave_management.models.core import global_holiday_dates

    return global_holiday_dates(start, end)


def next_working_day(day: date) -> date:
    """``day`` itself when it is a working day, otherwise the next one."""
    holidays = _holidays(day, day + timedelta(days=_MAX_SPAN_DAYS))
    for _ in range(_MAX_SPAN_DAYS):
        if day.weekday() < 5 and day not in holidays:
            return day
        day += timedelta(days=1)
    return day


def previous_working_day(day: date) -> date:
    """``day`` itself when it is a working day, otherwise the one before."""
    holidays = _holidays(day - timedelta(days=_MAX_SPAN_DAYS), day)
    for _ in range(_MAX_SPAN_DAYS):
        if day.weekday() < 5 and day not in holidays:
            return day
        day -= timedelta(days=1)
    return day


def month_end_working_day(year: int, month: int) -> date:
    """Last working day of the month. Rolls back, never into the next month."""
    return previous_working_day(date(year, month, monthrange(year, month)[1]))


def month_cutoff_date(year: int, month: int) -> date:
    """The day after which month ``month`` accepts no more entries.

    The 2nd of the following month, moved to the next working day.
    """
    following = date(year + 1, 1, 2) if month == 12 else date(year, month + 1, 2)
    return next_working_day(following)
