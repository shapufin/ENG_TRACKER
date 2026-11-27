"""How files order and label overtime and standby entries (workflow-invariants item 63).

A standby night is stored as one record per calendar-day segment, so a date can hold
``00:00-09:00`` (the end of the previous night) and ``18:00-00:00``. Files list the
evening row first and the morning tail after it. Entries typed as plain hours have no
times and come first. The rule is for standby only; overtime sorts by start time.
``standby_sort_key`` and ``standby_order_by`` are the same rule in Python and SQL.
"""
from datetime import time

from django.db.models import Case, F, IntegerField, Q, Value, When

OVERTIME_TYPE_LABEL = 'Extra hours'
STANDBY_TYPE_LABEL = 'On Call Service'


def clock(value) -> str:
    return value.strftime('%H:%M') if value else ''


def overtime_sort_key(start) -> tuple:
    return (start is not None, False, start or time.min)


def standby_sort_key(start, end) -> tuple:
    tail = start == time.min and end is not None and end != time.min
    return (start is not None, tail, start or time.min)


def standby_order_by() -> tuple:
    """``order_by`` arguments for the rows of one date, matching ``standby_sort_key``."""
    tail = Q(start_time=time.min, end_time__isnull=False) & ~Q(end_time=time.min)
    return (
        Case(When(tail, then=Value(1)), default=Value(0), output_field=IntegerField()).asc(),
        F('start_time').asc(nulls_first=True),
    )
