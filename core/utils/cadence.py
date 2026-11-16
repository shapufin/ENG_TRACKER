"""One definition of a recurring meeting schedule (weekly, biweekly, monthly).

Shared by the HBPR assignment cadence and the Line Manager's 1-on-1 plans, so the two
can never disagree about "next due". Pure functions: no database access.
"""
from __future__ import annotations

import calendar
from datetime import date, timedelta

# A blocked run longer than this never loops forever.
MAX_PUSHES = 6


def get_nth_weekday_of_month(year: int, month: int, nth: int, weekday: int) -> date:
    """Nth weekday of a month: nth 1..4 or -1 (last); weekday 0=Monday ... 6=Sunday."""
    if nth == -1:
        last_day = calendar.monthrange(year, month)[1]
        cur = date(year, month, last_day)
        offset = (cur.weekday() - weekday) % 7
        return cur - timedelta(days=offset)

    first_day = date(year, month, 1)
    offset = (weekday - first_day.weekday()) % 7
    target = first_day + timedelta(days=offset) + timedelta(weeks=nth - 1)
    if target.month != month:
        # The month has no 5th occurrence: fall back to the last one.
        return target - timedelta(weeks=1)
    return target


def raw_next_due(cadence, day_of_week, nth_week, effective_from, last_meeting_on) -> date:
    """Next slot after the last meeting (or the start date), ignoring holidays."""
    anchor = last_meeting_on or effective_from

    if cadence in ('weekly', 'biweekly'):
        step = 7 if cadence == 'weekly' else 14
        if day_of_week is not None:
            if last_meeting_on is None:
                offset = (day_of_week - effective_from.weekday()) % 7
                return effective_from + timedelta(days=offset)
            next_due = last_meeting_on + timedelta(days=step)
            return next_due + timedelta(days=(day_of_week - next_due.weekday()) % 7)
        return anchor + timedelta(days=step)

    # Monthly
    if nth_week is not None and day_of_week is not None:
        if last_meeting_on is None:
            candidate = get_nth_weekday_of_month(
                effective_from.year, effective_from.month, nth_week, day_of_week
            )
            if candidate >= effective_from:
                return candidate
            year = effective_from.year + (1 if effective_from.month == 12 else 0)
            month = 1 if effective_from.month == 12 else effective_from.month + 1
            return get_nth_weekday_of_month(year, month, nth_week, day_of_week)
        year = last_meeting_on.year + (1 if last_meeting_on.month == 12 else 0)
        month = 1 if last_meeting_on.month == 12 else last_meeting_on.month + 1
        return get_nth_weekday_of_month(year, month, nth_week, day_of_week)

    year, month = anchor.year, anchor.month
    if month == 12:
        year, month = year + 1, 1
    else:
        month += 1
    return date(year, month, min(anchor.day, calendar.monthrange(year, month)[1]))


def next_due_slot(cadence, day_of_week, nth_week, effective_from, last_meeting_on, *, blocked):
    """``(due, moved_from)``: the next slot, moved past every date in ``blocked``.

    ``blocked`` is a set of dates (public holidays, and for 1-on-1s the employee's leave).
    ``moved_from`` is the first blocked date hit, ``None`` when nothing moved.
    """
    if not cadence:
        return None, None
    due = raw_next_due(cadence, day_of_week, nth_week, effective_from, last_meeting_on)
    moved_from = None
    for _ in range(MAX_PUSHES):
        if due not in blocked:
            break
        moved_from = moved_from or due
        due = raw_next_due(cadence, day_of_week, nth_week, effective_from, due)
    return due, moved_from


NTH_WEEK_VALUES = (1, 2, 3, 4, -1)


def schedule_errors(cadence, day_of_week, nth_week) -> dict[str, str]:
    """Field errors for a schedule triple; empty when valid. ``cadence`` is required."""
    errors: dict[str, str] = {}
    if cadence not in ('weekly', 'biweekly', 'monthly'):
        errors['cadence'] = 'Choose weekly, biweekly or monthly.'
        return errors
    if day_of_week is not None and day_of_week not in range(7):
        errors['cadence_day_of_week'] = 'Must be between 0 (Monday) and 6 (Sunday).'
    if nth_week is not None:
        if cadence != 'monthly':
            errors['cadence_nth_week'] = 'Only valid for a monthly cadence.'
        elif nth_week not in NTH_WEEK_VALUES:
            errors['cadence_nth_week'] = 'Must be 1, 2, 3, 4 or -1 (last).'
        elif day_of_week is None:
            errors['cadence_day_of_week'] = 'Required when choosing a week of the month.'
    return errors
