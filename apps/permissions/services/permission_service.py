"""
Permission Service for the Time Tracker application.

This module provides a centralized permission checking service with support for:
- Role-based permissions
- Team-based permissions with hierarchy
- Group-based permissions
- Caching for performance with automatic versioning
"""

from ..models import UserRole, RolePermission
from apps.core.cache_constants import CacheKey, CacheTTL, CachePattern
from core.utils.cache import delete_pattern_safe, get_cache
from .capability_registry import is_protected
from .role_service import has_role
import logging

logger = logging.getLogger(__name__)


class PermissionService:
    """
    Centralized permission checking service.
    
    Supports role-based, team-based, and group-based permissions
    with built-in caching for performance and automatic versioning.
    """
    
    def __init__(self, cache_timeout=None):
        self.cache_timeout = cache_timeout or CacheTTL.LONG
    
    def has_permission(self, user, module, action, team_code=None):
        """
        Check if user has permission for a module/action.
        
        Args:
            user: User instance
            module: Permission module (e.g., 'overtime', 'standby')
            action: Permission action (e.g., 'view', 'create', 'approve')
            team_code: Optional team code for team-scoped permissions
        
        Returns:
            bool: True if user has permission
        """
        # Protected capabilities cannot be granted by database role edits.
        if is_protected(module, action) and not user.is_superuser:
            return False

        cache_key = CacheKey.permission(user.id, module, action, team_code or 'all')
        try:
            c = get_cache()
            result = c.get(cache_key)
            
            if result is not None:
                return result
        except Exception as e:
            logger.warning("Cache get failed, proceeding without cache: %s", e)

        # Superusers have all permissions
        if user.is_superuser:
            try:
                c = get_cache()
                c.set(cache_key, True, self.cache_timeout)
            except Exception:
                pass
            return True
        
        # Application admin role, not the Django admin flag, grants
        # application capabilities. Superusers are handled above.
        if has_role(user, 'admin'):
            try:
                c = get_cache()
                c.set(cache_key, True, self.cache_timeout)
            except Exception:
                pass
            return True

        # Check role-based permissions.
        role_perm = self._check_role_permission(user, module, action)
        if role_perm:
            try:
                c = get_cache()
                c.set(cache_key, True, self.cache_timeout)
            except Exception:
                pass
            return True
        
        try:
            c = get_cache()
            c.set(cache_key, False, self.cache_timeout)
        except Exception:
            pass
        return False

    def can_approve(self, user, obj):
        """
        Centralized approval permission logic moved from PermissionChecker.

        TL approval uses the same membership sources as get_team_member_ids /
        IsOwnerOrTeamLeader / DeletePermissionMixin: direct italian_tl and
        albanian_tl FKs, shared team M2M membership, and Team.team_leader
        (led_teams). FK-only checks silently deny led-team TLs who can already
        see and delete those entries on team pages.
        """
        if user.is_superuser or user.is_staff:
            return True

        if hasattr(user, 'profile'):
            profile = user.profile
            # HR can approve anything. Database roles are authoritative with
            # the legacy profile flag retained during migration.
            if has_role(user, 'hr') or getattr(profile, 'is_hr_user', False):
                return True

            # Team leaders can approve managed users' entries (all TL sources).
            # Role grants capability; team relationships provide scope.
            if (
                has_role(user, 'italian_tl')
                or has_role(user, 'albanian_tl')
                or profile.is_team_leader
            ): 
                obj_user = getattr(obj, 'user', None)
                if obj_user is not None:
                    try:
                        target_user_ids = profile.get_team_member_ids()
                        if obj_user.id in target_user_ids:
                            return True
                    except Exception:
                        logger.exception(
                            "Failed team-member lookup during approve check for user_id=%s",
                            getattr(user, 'id', None),
                        )

        return self.has_permission(user, obj._meta.model_name, 'approve')
    
    def _check_role_permission(self, user, module, action):
        """Check if user has role-based permission."""
        user_roles = UserRole.objects.filter(
            user=user,
            is_active=True
        ).select_related('role').prefetch_related('role__permissions')
        
        for user_role in user_roles:
            if self._role_has_permission(user_role.role, module, action):
                return True
        
        return False
    
    def _role_has_permission(self, role, module, action):
        """Check if role has specific permission."""
        return RolePermission.objects.filter(
            role=role,
            permission__module=module,
            permission__action=action
        ).exists()
    
    def invalidate_user_cache(self, user):
        """Invalidate all permission cache for a user."""
        patterns = [
            CachePattern.user_permissions(user.id),
            CachePattern.user_all(user.id),
        ]
        for pattern in patterns:
            delete_pattern_safe(pattern)
    
    def get_user_permissions(self, user):
        """Get all permissions for a user."""
        permissions = set()
        
        # Get role permissions
        user_roles = UserRole.objects.filter(
            user=user,
            is_active=True
        ).select_related('role').prefetch_related('role__permissions')
        
        for user_role in user_roles:
            role_perms = RolePermission.objects.filter(
                role=user_role.role
            ).select_related('permission')
            for rp in role_perms:
                permissions.add(f"{rp.permission.module}:{rp.permission.action}")
        
        return list(permissions)


# Global permission service instance
permission_service = PermissionService()
