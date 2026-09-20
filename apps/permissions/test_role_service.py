from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase

from apps.permissions.models import Role, UserRole
from apps.permissions.services.role_service import (
    assign_role,
    find_blocked_tl_revocations,
    find_blocked_tl_revocations_bulk,
    get_tl_dependents,
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


class GetTlDependentsTests(TestCase):
    """get_tl_dependents finds profiles whose italian_tl/albanian_tl FK
    still points at a given user — the set that must be reassigned/cleared
    before that user's TL role can safely be revoked."""

    def setUp(self):
        self.tl = User.objects.create_user(username='tl-user', password='x')
        self.dependent = User.objects.create_user(username='dependent-user', password='x')
        self.other = User.objects.create_user(username='other-user', password='x')

    def test_finds_dependent_by_italian_tl_fk(self):
        self.dependent.profile.italian_tl = self.tl
        self.dependent.profile.save()

        dependents = get_tl_dependents(self.tl, 'italian_tl')

        self.assertEqual({p.user_id for p in dependents}, {self.dependent.id})

    def test_finds_dependent_by_albanian_tl_fk(self):
        self.dependent.profile.albanian_tl = self.tl
        self.dependent.profile.save()

        dependents = get_tl_dependents(self.tl, 'albanian_tl')

        self.assertEqual({p.user_id for p in dependents}, {self.dependent.id})

    def test_italian_tl_lookup_ignores_albanian_tl_dependents(self):
        self.dependent.profile.albanian_tl = self.tl
        self.dependent.profile.save()

        dependents = get_tl_dependents(self.tl, 'italian_tl')

        self.assertEqual(list(dependents), [])

    def test_no_dependents_returns_empty(self):
        self.assertEqual(list(get_tl_dependents(self.tl, 'italian_tl')), [])

    def test_unknown_role_code_returns_empty(self):
        self.dependent.profile.italian_tl = self.tl
        self.dependent.profile.save()

        self.assertEqual(list(get_tl_dependents(self.tl, 'hr')), [])


class FindBlockedTlRevocationsTests(TestCase):
    """find_blocked_tl_revocations centralizes the "would this revoke leave
    a dependent's FK dangling" check so every caller (bulk_update,
    update_user, and the data importer's update_user_profile) shares one
    implementation instead of re-deriving it."""

    def setUp(self):
        self.tl = User.objects.create_user(username='blk-tl', password='x')
        self.dependent = User.objects.create_user(username='blk-dep', password='x')

    def test_blocks_when_legacy_flag_true_and_dependent_exists(self):
        self.tl.profile.is_italian_tl_role = True
        self.tl.profile.save()
        self.dependent.profile.italian_tl = self.tl
        self.dependent.profile.save()

        blocked = find_blocked_tl_revocations(self.tl, {'italian_tl': False})

        self.assertEqual(len(blocked), 1)
        self.assertEqual(blocked[0]['role'], 'italian_tl')
        self.assertEqual(
            [d['profile_id'] for d in blocked[0]['dependents']],
            [self.dependent.profile.id],
        )

    def test_blocks_when_role_granted_via_role_codes_not_legacy_flag(self):
        """Regression: a TL role granted via assign_role() directly (as
        apps/users/management/commands/seed_e2e_data.py does) sets
        role_codes but leaves is_italian_tl_role False. The block must
        still fire — is_italian_tl (the property) checks role_codes too,
        unlike a raw is_italian_tl_role read."""
        self.tl.profile.role_codes = ['italian_tl']
        self.tl.profile.save()
        self.assertFalse(self.tl.profile.is_italian_tl_role)
        self.dependent.profile.italian_tl = self.tl
        self.dependent.profile.save()

        blocked = find_blocked_tl_revocations(self.tl, {'italian_tl': False})

        self.assertEqual(len(blocked), 1)

    def test_no_block_when_no_dependents(self):
        self.tl.profile.is_italian_tl_role = True
        self.tl.profile.save()

        blocked = find_blocked_tl_revocations(self.tl, {'italian_tl': False})

        self.assertEqual(blocked, [])

    def test_no_block_when_role_unchanged(self):
        self.tl.profile.is_italian_tl_role = True
        self.tl.profile.save()
        self.dependent.profile.italian_tl = self.tl
        self.dependent.profile.save()

        blocked = find_blocked_tl_revocations(self.tl, {'italian_tl': True})

        self.assertEqual(blocked, [])

    def test_no_block_when_role_code_absent_from_new_state(self):
        """A role_code not present in new_state means 'not being touched by
        this request' — must never be treated as a revoke."""
        self.tl.profile.is_italian_tl_role = True
        self.tl.profile.save()
        self.dependent.profile.italian_tl = self.tl
        self.dependent.profile.save()

        blocked = find_blocked_tl_revocations(self.tl, {'albanian_tl': False})

        self.assertEqual(blocked, [])


class FindBlockedTlRevocationsBulkTests(TestCase):
    """Batched variant used by bulk_update: checks many users against the
    same new_state in O(1) queries per role instead of one get_tl_dependents
    query per user (apps/users/viewsets.py's bulk_update revokes the same
    role field uniformly across every selected user)."""

    def setUp(self):
        self.tl1 = User.objects.create_user(username='bulk-tl1', password='x')
        self.tl2 = User.objects.create_user(username='bulk-tl2', password='x')
        self.no_dep_tl = User.objects.create_user(username='bulk-tl3', password='x')
        self.dep1 = User.objects.create_user(username='bulk-dep1', password='x')
        self.dep2 = User.objects.create_user(username='bulk-dep2', password='x')

        for tl in (self.tl1, self.tl2, self.no_dep_tl):
            tl.profile.is_italian_tl_role = True
            tl.profile.save()

        self.dep1.profile.italian_tl = self.tl1
        self.dep1.profile.save()
        self.dep2.profile.italian_tl = self.tl2
        self.dep2.profile.save()

    def test_matches_the_per_user_result_across_a_batch(self):
        blocked = find_blocked_tl_revocations_bulk(
            [self.tl1, self.tl2, self.no_dep_tl], {'italian_tl': False}
        )

        blocked_by_user = {b['user_id']: b for b in blocked}
        self.assertEqual(set(blocked_by_user), {self.tl1.id, self.tl2.id})
        self.assertEqual(
            [d['profile_id'] for d in blocked_by_user[self.tl1.id]['dependents']],
            [self.dep1.profile.id],
        )
        self.assertEqual(
            [d['profile_id'] for d in blocked_by_user[self.tl2.id]['dependents']],
            [self.dep2.profile.id],
        )

    def test_query_count_is_constant_not_linear_in_batch_size(self):
        with self.assertNumQueries(2):
            find_blocked_tl_revocations_bulk(
                [self.tl1, self.tl2, self.no_dep_tl], {'italian_tl': False}
            )

    def test_empty_candidate_list_returns_empty(self):
        self.assertEqual(find_blocked_tl_revocations_bulk([], {'italian_tl': False}), [])

    def test_role_code_absent_from_new_state_is_never_checked(self):
        self.assertEqual(
            find_blocked_tl_revocations_bulk([self.tl1], {'albanian_tl': False}), []
        )


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
