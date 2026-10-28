"""The single source of truth for site-wide maintenance mode.

Every consumer — the DRF authentication classes, the login/refresh/MFA guards
and the public status endpoint — reads the state through this module. Nothing
else queries ``MaintenanceState`` or caches it.

Three rules that must not be broken here:

1. **Fail open.** A cache outage or a not-yet-migrated table resolves to
   "inactive". Maintenance mode must never be the reason every request 500s.
2. **Self-heal on read.** ``ends_at`` in the past flips the row off. That is a
   bounded, idempotent ``UPDATE`` (it matches zero rows afterwards), not a
   scheduler job.
3. **Explicit invalidation.** ``MaintenanceState.save()`` and the self-heal
   both clear the cache, so the kill switch is instant across workers; the TTL
   only bounds how late an *auto-expiry* is noticed.
"""

import logging

from django.core.cache import cache
from django.utils import timezone

from apps.core.cache_constants import CacheKey, CacheTTL

logger = logging.getLogger(__name__)

CACHE_TTL = CacheTTL.SHORT

_INACTIVE = {
    'active': False,
    'title': '',
    'message': '',
    'started_at': None,
    'ends_at': None,
    'updated_at': None,
}


def clear_maintenance_cache() -> None:
    try:
        cache.delete(CacheKey.maintenance_state())
    except Exception as exc:  # noqa: BLE001 - a cache outage must not break writes
        logger.warning('Could not clear the maintenance cache: %s', exc)


def _normalise_expired() -> None:
    """Flip an expired window off. Idempotent; matches no rows once healed."""
    from apps.dashboard.models import MaintenanceState

    try:
        MaintenanceState.objects.filter(
            is_active=True, ends_at__lte=timezone.now()
        ).update(is_active=False, started_at=None, ends_at=None)
    except Exception as exc:  # noqa: BLE001 - never let healing break a request
        logger.warning('Could not auto-expire the maintenance window: %s', exc)


def _load_state() -> dict:
    # Lazy import: core must not import app models at module level.
    from apps.dashboard.models import (
        DEFAULT_MAINTENANCE_MESSAGE,
        DEFAULT_MAINTENANCE_TITLE,
        MaintenanceState,
    )

    try:
        row = MaintenanceState.objects.filter(pk=1).first()
    except Exception as exc:  # noqa: BLE001 - e.g. the migration has not run yet
        logger.warning('Maintenance state unavailable, assuming off: %s', exc)
        return dict(_INACTIVE)

    if row is None:
        # No row yet: the admin form must still start from the copy the model
        # would use, not from blank fields (a blank headline is invalid).
        return dict(
            _INACTIVE,
            title=DEFAULT_MAINTENANCE_TITLE,
            message=DEFAULT_MAINTENANCE_MESSAGE,
        )

    now = timezone.now()
    if row.is_active and row.ends_at is not None and row.ends_at <= now:
        _normalise_expired()
        return dict(_INACTIVE)

    return {
        'active': bool(row.is_active),
        'title': row.title,
        'message': row.message,
        'started_at': row.started_at,
        'ends_at': row.ends_at,
        'updated_at': row.updated_at,
    }


def get_maintenance_state() -> dict:
    """Cached state dict. Always returns a dict; never raises."""
    key = CacheKey.maintenance_state()
    try:
        cached = cache.get(key)
    except Exception as exc:  # noqa: BLE001 - fall back to the database
        logger.warning('Maintenance cache read failed: %s', exc)
        cached = None
    if isinstance(cached, dict):
        return cached

    state = _load_state()
    try:
        cache.set(key, state, CACHE_TTL)
    except Exception as exc:  # noqa: BLE001 - correctness does not depend on the cache
        logger.warning('Maintenance cache write failed: %s', exc)
    return state


def is_maintenance_active() -> bool:
    return bool(get_maintenance_state()['active'])


def is_user_exempt(user) -> bool:
    """Staff admins keep working during maintenance.

    Matches the app's ``isAdmin`` definition (``is_staff``). A role-only CR
    admin (``cr_admin`` without ``is_staff``) is deliberately NOT exempt.
    """
    if user is None or not getattr(user, 'is_authenticated', False):
        return False
    return bool(user.is_staff or user.is_superuser)
