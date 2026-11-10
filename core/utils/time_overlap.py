"""Time-overlap validation for OvertimeLog and StandbyLog.

A user cannot have two same-day entries whose [start_time, end_time) ranges
overlap, regardless of client. Overnight ranges (end_time <= start_time) are
treated as spanning to the next day. Entries without start_time/end_time are
exempt (no time range to compare).

Used by serializers and model save() to enforce the rule that replaced the
old unique_overtime_per_day_client / unique_standby_per_day DB constraints.
"""

from datetime import datetime, timedelta
from typing import Optional


def _range_minutes(start_time, end_time) -> Optional[tuple]:
    """Return (start_minutes, end_minutes) for a same-day time range.

    Overnight ranges (end <= start) extend end by 24h. Returns None if either
    time is missing.
    """
    if not start_time or not end_time:
        return None
    start = datetime.combine(datetime.today(), start_time)
    end = datetime.combine(datetime.today(), end_time)
    if end <= start:
        end += timedelta(days=1)
    return (start, end)


def ranges_overlap(a_start, a_end, b_start, b_end) -> bool:
    """Check whether two same-day time ranges overlap."""
    a = _range_minutes(a_start, a_end)
    b = _range_minutes(b_start, b_end)
    if a is None or b is None:
        return False
    return a[0] < b[1] and b[0] < a[1]


def _span(day, start_time, end_time):
    """Absolute ``(start, end)`` datetimes of an entry dated ``day``.

    An overnight range (end <= start) ends on the next calendar day.
    """
    start = datetime.combine(day, start_time)
    end = datetime.combine(day, end_time)
    if end <= start:
        end += timedelta(days=1)
    return start, end


def find_overlapping_entry(
    queryset,
    user_id,
    date,
    start_time,
    end_time,
    exclude_pk=None,
):
    """Return the first existing entry of the same user whose time range
    overlaps the given (start_time, end_time) dated ``date``.

    Ranges are compared as absolute datetimes, so an overnight entry (end <=
    start, ending the next morning) also clashes with entries dated the next
    day, and an entry dated the day before that runs past midnight clashes
    with this one. Returns None if no overlap is found, or if
    start_time/end_time is missing. Entries without their own
    start_time/end_time are skipped (no range to compare). Rejected entries
    are excluded - a rejected time slot is released and the user can create a
    new entry in the same range.
    """
    if not start_time or not end_time:
        return None
    new_start, new_end = _span(date, start_time, end_time)
    qs = queryset.filter(
        user_id=user_id, date__gte=date - timedelta(days=1), date__lte=date + timedelta(days=1),
    )
    if exclude_pk is not None:
        qs = qs.exclude(pk=exclude_pk)
    for existing in qs.only('pk', 'date', 'start_time', 'end_time', 'status'):
        if existing.status == 'rejected':
            continue
        if existing.start_time and existing.end_time:
            start, end = _span(existing.date, existing.start_time, existing.end_time)
            if new_start < end and start < new_end:
                return existing
    return None
