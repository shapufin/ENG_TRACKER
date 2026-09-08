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


def find_overlapping_entry(
    queryset,
    user_id,
    date,
    start_time,
    end_time,
    exclude_pk=None,
):
    """Return the first existing entry on the same date for the same user
    whose time range overlaps the given (start_time, end_time).

    Returns None if no overlap is found, or if start_time/end_time is missing.
    Entries without their own start_time/end_time are skipped (no range to
    compare). Rejected entries are excluded — a rejected time slot is
    released and the user can create a new entry in the same range.
    """
    if not start_time or not end_time:
        return None
    qs = queryset.filter(user_id=user_id, date=date)
    if exclude_pk is not None:
        qs = qs.exclude(pk=exclude_pk)
    for existing in qs.only('pk', 'start_time', 'end_time', 'status'):
        if existing.status == 'rejected':
            continue
        if existing.start_time and existing.end_time:
            if ranges_overlap(start_time, end_time,
                              existing.start_time, existing.end_time):
                return existing
    return None
