"""
Cache constants and utilities for the Time Tracker application.

Provides standardized cache TTL values and cache key patterns
for consistent caching strategy across all modules.
"""

from django.conf import settings


class CacheTTL:
    """Standardized cache timeout values (in seconds)."""
    
    # Real-time data (no cache)
    REAL_TIME = 0
    
    # Fast-changing data (1 minute)
    SHORT = 60
    
    # Medium-changing data (5 minutes)
    MEDIUM = 300
    
    # Slow-changing data (30 minutes)
    LONG = 1800
    
    # Static data (24 hours)
    VERY_LONG = 86400


class CacheKey:
    """Cache key patterns for organized cache management."""
    
    @staticmethod
    def permission(user_id: int, module: str, action: str, team_code: str = 'all') -> str:
        """Generate permission cache key with versioning."""
        version = getattr(settings, 'CACHE_VERSION', 1)
        return f"v{version}:perm:{user_id}:{module}:{action}:{team_code}"
    
    @staticmethod
    def user(user_id: int) -> str:
        """Generate user cache key with versioning."""
        version = getattr(settings, 'CACHE_VERSION', 1)
        return f"v{version}:user:{user_id}"
    
    @staticmethod
    def role(role_id: int) -> str:
        """Generate role cache key with versioning."""
        version = getattr(settings, 'CACHE_VERSION', 1)
        return f"v{version}:role:{role_id}"
    
    @staticmethod
    def team(team_id: int) -> str:
        """Generate team cache key with versioning."""
        version = getattr(settings, 'CACHE_VERSION', 1)
        return f"v{version}:team:{team_id}"
    
    @staticmethod
    def dashboard(user_id: int, dashboard_type: str) -> str:
        """Generate dashboard cache key with versioning."""
        version = getattr(settings, 'CACHE_VERSION', 1)
        return f"v{version}:dashboard:{user_id}:{dashboard_type}"


class CachePattern:
    """Cache key patterns for bulk invalidation."""
    
    @staticmethod
    def user_permissions(user_id: int) -> str:
        """Pattern for all permission cache keys for a user."""
        version = getattr(settings, 'CACHE_VERSION', 1)
        return f"v{version}:perm:{user_id}:*"
    
    @staticmethod
    def user_all(user_id: int) -> str:
        """Pattern for all cache keys for a user."""
        version = getattr(settings, 'CACHE_VERSION', 1)
        return f"v{version}:user:{user_id}:*"
    
    @staticmethod
    def dashboard_all() -> str:
        """Pattern for all dashboard cache keys."""
        version = getattr(settings, 'CACHE_VERSION', 1)
        return f"v{version}:dashboard:*"

    @staticmethod
    def role_all(role_id: int) -> str:
        """Pattern for all cache keys for a role."""
        version = getattr(settings, 'CACHE_VERSION', 1)
        return f"v{version}:role:{role_id}:*"
    
    @staticmethod
    def team_all(team_id: int) -> str:
        """Pattern for all cache keys for a team."""
        version = getattr(settings, 'CACHE_VERSION', 1)
        return f"v{version}:team:{team_id}:*"
