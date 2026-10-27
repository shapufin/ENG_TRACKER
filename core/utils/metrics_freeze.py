"""When a month's metrics stop changing.

Month M is provisional until 00:00 on day ``METRICS_FREEZE_DAY`` (default 10) of
M+1 in the business timezone. A row is *final* only if it was computed at or
after that moment; a row computed earlier still needs one last recompute.
"""
from datetime import date, datetime

from django.conf import settings
from django.utils import timezone

from core.utils.timezone_local import business_tz


def freeze_at(month: date) -> datetime:
    """The moment month ``month``'s metrics become immutable."""
    year, number = (month.year + 1, 1) if month.month == 12 else (month.year, month.month + 1)
    return datetime(year, number, getattr(settings, 'METRICS_FREEZE_DAY', 10), tzinfo=business_tz())


def is_past_freeze(month: date, now: datetime | None = None) -> bool:
    return (now or timezone.now()) >= freeze_at(month)


def is_frozen(month: date, computed_at: datetime | None, now: datetime | None = None) -> bool:
    """True when the row for ``month`` must not be recomputed any more."""
    return (
        computed_at is not None
        and is_past_freeze(month, now)
        and computed_at >= freeze_at(month)
    )
