"""Cache invalidation mixin for domain data caches."""

from apps.core.cache_constants import CachePattern
from core.utils.cache import delete_pattern_safe


class CacheInvalidationMixin:
    """Mixin providing centralized cache invalidation hooks."""

    def invalidate_related_cache(self):
        """Invalidate dashboard caches without affecting unrelated domains."""
        delete_pattern_safe(CachePattern.dashboard_all())
