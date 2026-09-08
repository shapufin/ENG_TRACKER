"""
Cache utilities for the application.

Provides helper functions for permission caching and general cache operations.
Uses standardized cache constants with automatic versioning.
Includes fallback to LocMemCache if Redis is unavailable.
"""

import fnmatch
import logging
import time

from django.core.cache import cache

from apps.core.cache_constants import CacheKey, CachePattern, CacheTTL

logger = logging.getLogger(__name__)


def get_cache():
    """
    Get cache instance. Uses LocMemCache by default, Redis if USE_REDIS=true.
    """
    try:
        return cache
    except Exception as e:
        logger.error(f"Cache unavailable: {str(e)}")
        return cache


def delete_pattern_safe(pattern: str) -> None:
    """Delete all cache keys matching a glob ``pattern``.

    Redis backends implement ``cache.delete_pattern`` natively. LocMemCache
    (used in dev/test and as a fallback) does not, so we manually iterate
    its in-memory dict and delete matching keys. Without this fallback,
    permission cache invalidation silently no-ops on non-Redis backends,
    leaving stale permission entries until TTL expiry.
    """
    c = get_cache()
    delete_pattern = getattr(c, 'delete_pattern', None)
    if callable(delete_pattern):
        delete_pattern(pattern)
        return
    # LocMemCache fallback: iterate the underlying dict and delete matches.
    # Django's ``make_key`` adds a backend prefix (e.g. ``:1:``) to every
    # stored key, so we apply the same transformation to the pattern before
    # glob-matching. LocMemCache stores entries as (value, expiry) tuples;
    # expired entries are pruned lazily, so we skip them to avoid
    # resurrecting stale data.
    store = getattr(c, '_cache', None)
    if not isinstance(store, dict):
        return
    try:
        full_pattern = c.make_key(pattern)
    except Exception:
        full_pattern = pattern
    now = time.time()
    for key in list(store.keys()):
        if not fnmatch.fnmatch(str(key), full_pattern):
            continue
        entry = store.get(key)
        if isinstance(entry, tuple) and len(entry) == 2:
            _value, expiry = entry
            if expiry is not None and expiry < now:
                continue
        # Keys in ``_cache`` are already ``make_key``-transformed; calling
        # ``c.delete(key)`` would apply ``make_key`` again and miss. Use
        # the backend's private ``_delete`` (handles ``_expire_info`` too),
        # falling back to direct dict cleanup for non-LocMemCache backends.
        raw_delete = getattr(c, '_delete', None)
        if callable(raw_delete):
            try:
                raw_delete(key)
                continue
            except Exception:
                pass
        store.pop(key, None)
        expire_info = getattr(c, '_expire_info', None)
        if isinstance(expire_info, dict):
            expire_info.pop(key, None)


def get_permission_cache_key(user_id, module, action, team_code=None):
    """Generate cache key for permission check with versioning."""
    return CacheKey.permission(user_id, module, action, team_code or 'all')


def get_user_cache_key(user_id, data_type=None):
    """Generate cache key for user data with versioning."""
    if data_type:
        return f"{CacheKey.user(user_id)}:{data_type}"
    return CacheKey.user(user_id)


def delete_user_permission_cache(user_id):
    """Delete all permission cache for a user using pattern matching."""
    try:
        pattern = CachePattern.user_permissions(user_id)
        delete_pattern_safe(pattern)
    except Exception as e:
        logger.warning(f"Failed to delete permission cache: {str(e)}")


def invalidate_permission_cache_for_user(user):
    """Invalidate permission cache when user permissions change."""
    delete_user_permission_cache(user.id)


def set_cached_permission(user_id, module, action, result, team_code=None, timeout=None):
    """Cache permission result with standardized TTL."""
    try:
        c = get_cache()
        key = get_permission_cache_key(user_id, module, action, team_code)
        ttl = timeout or CacheTTL.LONG
        c.set(key, result, ttl)
    except Exception as e:
        logger.warning(f"Failed to set permission cache: {str(e)}")


def get_cached_permission(user_id, module, action, team_code=None):
    """Get cached permission result."""
    try:
        c = get_cache()
        key = get_permission_cache_key(user_id, module, action, team_code)
        return c.get(key)
    except Exception as e:
        logger.warning(f"Failed to get permission cache: {str(e)}")
        return None
