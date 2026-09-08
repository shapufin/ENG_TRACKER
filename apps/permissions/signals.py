"""
Permission signals for cache invalidation.

This module contains Django signals to invalidate permission cache
when permission-related models change.
"""

from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from core.utils.cache import invalidate_permission_cache_for_user


@receiver([post_save, post_delete], sender='permissions.UserRole')
def invalidate_user_role_cache(sender, instance, **kwargs):
    """Invalidate cache and refresh the denormalized role-code cache."""
    invalidate_permission_cache_for_user(instance.user)
    from .services.role_service import _refresh_role_cache
    _refresh_role_cache(instance.user)


@receiver([post_save, post_delete], sender='permissions.UserGroup')
def invalidate_user_group_cache(sender, instance, **kwargs):
    """Invalidate cache when user group changes."""
    invalidate_permission_cache_for_user(instance.user)


@receiver([post_save, post_delete], sender='permissions.RolePermission')
def invalidate_role_permission_cache(sender, instance, **kwargs):
    """Invalidate cache for all users with this role."""
    from .models import UserRole
    user_roles = UserRole.objects.filter(role=instance.role, is_active=True)
    for user_role in user_roles:
        invalidate_permission_cache_for_user(user_role.user)
