from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase

from apps.permissions.models import Role, UserRole
from apps.permissions.services.role_service import (
    assign_role,
    get_user_roles,
    has_role,
    revoke_role,
)


User = get_user_model()


class RoleServiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='role-user', password='testpass')
        self.role = Role.objects.create(
            name='Test Role', code='test_role', description='Test role'
        )

    def test_assign_role_is_idempotent_and_cached(self):
        assignment = assign_role(self.user, self.role.code)
        self.assertTrue(assignment.is_active)
        assign_role(self.user, self.role.code)
        self.assertEqual(
            UserRole.objects.filter(user=self.user, role=self.role, team=None).count(), 1
        )
        self.assertEqual(get_user_roles(self.user), {'test_role'})
        self.assertTrue(has_role(self.user, 'test_role'))

    def test_revoke_role_deactivates_without_deleting_history(self):
        assign_role(self.user, self.role.code)
        self.assertEqual(revoke_role(self.user, self.role.code), 1)
        assignment = UserRole.objects.get(user=self.user, role=self.role)
        self.assertFalse(assignment.is_active)
        self.assertEqual(get_user_roles(self.user), set())
        self.assertFalse(has_role(self.user, 'test_role'))


class PermissionCacheInvalidationTests(TestCase):
    """``delete_pattern`` is Redis-only; LocMemCache silently no-ops.

    The invalidation helper must fall back to manual key deletion so
    permission cache entries are actually removed in dev/non-Redis envs.
    """

    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            username='cache-user', password='testpass'
        )

    def tearDown(self):
        cache.clear()

    def test_invalidate_user_cache_removes_permission_entries(self):
        from core.utils.cache import set_cached_permission, get_cached_permission
        from apps.permissions.services.permission_service import permission_service

        set_cached_permission(self.user.id, 'test', 'view', True)
        self.assertIsNotNone(get_cached_permission(self.user.id, 'test', 'view'))

        permission_service.invalidate_user_cache(self.user)

        self.assertIsNone(get_cached_permission(self.user.id, 'test', 'view'))

    def test_delete_user_permission_cache_removes_entries(self):
        from core.utils.cache import (
            set_cached_permission,
            get_cached_permission,
            delete_user_permission_cache,
        )

        set_cached_permission(self.user.id, 'test', 'view', True)
        set_cached_permission(self.user.id, 'test', 'manage', False)
        self.assertIsNotNone(get_cached_permission(self.user.id, 'test', 'view'))
        self.assertIsNotNone(get_cached_permission(self.user.id, 'test', 'manage'))

        delete_user_permission_cache(self.user.id)

        self.assertIsNone(get_cached_permission(self.user.id, 'test', 'view'))
        self.assertIsNone(get_cached_permission(self.user.id, 'test', 'manage'))

    def test_domain_invalidation_preserves_unrelated_cache_entries(self):
        from apps.core.cache_constants import CacheKey
        from core.mixins.cache import CacheInvalidationMixin

        cache.set(CacheKey.dashboard(self.user.id, 'employee'), 'stale-dashboard')
        cache.set('unrelated-cache-entry', 'keep-me')

        CacheInvalidationMixin().invalidate_related_cache()

        self.assertIsNone(cache.get(CacheKey.dashboard(self.user.id, 'employee')))
        self.assertEqual(cache.get('unrelated-cache-entry'), 'keep-me')
