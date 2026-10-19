"""The company's business calendar day, from the admin-editable
``GlobalSettings.business_timezone`` (default Europe/Tirane).

Django's TIME_ZONE is UTC, so `date.today()` and `timezone.localdate()` return
the previous day for the first hours of each local day. Any business decision
that depends on the company's calendar day (month defaults, SLA deadlines,
cutoffs) must use `business_today()` / `business_tz()` instead. The Django
zone is deliberately not activated per request: that would silently change
`TruncDate` / `__date` grouping elsewhere.
"""
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db import DatabaseError

DEFAULT_BUSINESS_TIMEZONE = 'Europe/Tirane'  # canonical IANA name for Albania (tzdata pinned in requirements.txt)
_CACHE_KEY = 'business_timezone'
_CACHE_TTL = 60  # bounds staleness across workers when the cache backend is per-process


def _zone(name):
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError, OSError):
        return None


def validate_business_timezone(value):
    if not value or _zone(value) is None:
        raise ValidationError(f'"{value}" is not a valid IANA time zone.')


def clear_business_tz_cache():
    cache.delete(_CACHE_KEY)


def _stored_name():
    # Lazy import: core must not import app models at module level.
    from apps.leave_management.models import GlobalSettings
    try:
        return GlobalSettings.objects.filter(pk=1).values_list('business_timezone', flat=True).first()
    except DatabaseError:  # e.g. column not migrated yet: fall back, never raise
        return None


def business_tz():
    name = cache.get(_CACHE_KEY)
    if name is None:
        name = _stored_name() or DEFAULT_BUSINESS_TIMEZONE
        cache.set(_CACHE_KEY, name, _CACHE_TTL)
    return _zone(name) or ZoneInfo(DEFAULT_BUSINESS_TIMEZONE)


def business_today():
    return datetime.now(business_tz()).date()
