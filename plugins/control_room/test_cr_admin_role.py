"""
Tests for the cr_admin scoped role.

Covers:
- is_cr_admin helper (role-based, staff short-circuit, inactive role)
- IsCRAdminOrStaff permission class
- ControlRoomAccessViewSet access for CR admins (list/create/update/delete/
  teams/remove_team/create_cr_user)
- Users endpoint filtering: CR admin sees only users with ControlRoomAccess
- UserSerializer is_cr_admin field
"""
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.permissions.models import Role, UserRole
from apps.users.models.core import Team, UserProfile
from apps.users.serializers import UserSerializer
from apps.users.viewsets import UserViewSet
from core.mixins.permissions import is_cr_admin
from plugins.control_room.models import ControlRoomAccess, ControlRoomTeamScope
from plugins.control_room.viewsets import ControlRoomAccessViewSet


def _make_user(username, **kwargs):
    user = User.objects.create_user(username=username, password='testpass123', **kwargs)
    UserProfile.objects.get_or_create(user=user)
    return user


def _make_team(name, code):
    return Team.objects.create(name=name, code=code)


def _assign_cr_admin(user):
    """Assign the cr_admin role (seeded by migration 0003) to a user."""
    role = Role.objects.get(code='cr_admin')
    UserRole.objects.get_or_create(user=user, role=role, defaults={'is_active': True})
    return user


class IsCRAdminHelperTests(TestCase):
    def setUp(self):
        self.regular = _make_user('regular')
        self.cr_admin = _assign_cr_admin(_make_user('cradmin'))
        self.staff = _make_user('staff1', is_staff=True)

    def test_regular_user_is_not_cr_admin(self):
        self.assertFalse(is_cr_admin(self.regular))

    def test_cr_admin_role_user_is_cr_admin(self):
        self.assertTrue(is_cr_admin(self.cr_admin))

    def test_staff_is_cr_admin(self):
        """Staff/superuser always pass is_cr_admin (hierarchy)."""
        self.assertTrue(is_cr_admin(self.staff))

    def test_inactive_role_not_cr_admin(self):
        role = Role.objects.get(code='cr_admin')
        ur = UserRole.objects.get(user=self.cr_admin, role=role)
        ur.is_active = False
        ur.save()
        self.assertFalse(is_cr_admin(self.cr_admin))

    def test_anonymous_not_cr_admin(self):
        from django.contrib.auth.models import AnonymousUser
        self.assertFalse(is_cr_admin(AnonymousUser()))


class CRAdminAccessViewSetTests(TestCase):
    """CR admin can manage Control Room access just like staff."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.staff = _make_user('staff1', is_staff=True)
        self.cr_admin = _assign_cr_admin(_make_user('cradmin'))
        self.regular = _make_user('regular')
        self.target = _make_user('target')
        self.team_a = _make_team('Team A', 'A')

    def _list(self, user):
        request = self.factory.get('/api/plugins/control_room/access/')
        force_authenticate(request, user=user)
        return ControlRoomAccessViewSet.as_view({'get': 'list'})(request)

    def _create(self, user, payload):
        request = self.factory.post(
            '/api/plugins/control_room/access/', payload, format='json'
        )
        force_authenticate(request, user=user)
        return ControlRoomAccessViewSet.as_view({'post': 'create'})(request)

    def _partial_update(self, user, pk, payload):
        request = self.factory.patch(
            f'/api/plugins/control_room/access/{pk}/', payload, format='json'
        )
        force_authenticate(request, user=user)
        return ControlRoomAccessViewSet.as_view({'patch': 'partial_update'})(request, pk=pk)

    def _destroy(self, user, pk):
        request = self.factory.delete(f'/api/plugins/control_room/access/{pk}/')
        force_authenticate(request, user=user)
        return ControlRoomAccessViewSet.as_view({'delete': 'destroy'})(request, pk=pk)

    def _add_team(self, user, pk, payload):
        request = self.factory.post(
            f'/api/plugins/control_room/access/{pk}/teams/', payload, format='json'
        )
        force_authenticate(request, user=user)
        return ControlRoomAccessViewSet.as_view({'post': 'teams'})(request, pk=pk)

    def _create_cr_user(self, user, payload):
        request = self.factory.post(
            '/api/plugins/control_room/access/create_cr_user/', payload, format='json'
        )
        force_authenticate(request, user=user)
        return ControlRoomAccessViewSet.as_view({'post': 'create_cr_user'})(request)

    def _eligible_users(self, user, query=''):
        request = self.factory.get(
            '/api/users/users/eligible_for_control_room/',
            {'search': query, 'page_size': 20},
        )
        force_authenticate(request, user=user)
        return UserViewSet.as_view({'get': 'eligible_for_control_room'})(request)

    def test_cr_admin_can_list(self):
        ControlRoomAccess.objects.create(user=self.target)
        resp = self._list(self.cr_admin)
        self.assertEqual(resp.status_code, 200)

    def test_cr_admin_can_create(self):
        resp = self._create(self.cr_admin, {
            'user': self.target.id,
            'team_ids': [self.team_a.id],
        })
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(
            ControlRoomAccess.objects.filter(user=self.target).exists()
        )

    def test_cr_admin_can_update(self):
        access = ControlRoomAccess.objects.create(user=self.target)
        resp = self._partial_update(self.cr_admin, access.id, {'is_active': False})
        self.assertEqual(resp.status_code, 200)
        access.refresh_from_db()
        self.assertFalse(access.is_active)

    def test_cr_admin_can_delete(self):
        access = ControlRoomAccess.objects.create(user=self.target)
        resp = self._destroy(self.cr_admin, access.id)
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(
            ControlRoomAccess.objects.filter(id=access.id).exists()
        )

    def test_cr_admin_can_add_team_scope(self):
        access = ControlRoomAccess.objects.create(user=self.target)
        resp = self._add_team(self.cr_admin, access.id, {'team': self.team_a.id})
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(
            ControlRoomTeamScope.objects.filter(access=access, team=self.team_a).exists()
        )

    def test_cr_admin_can_create_cr_user(self):
        resp = self._create_cr_user(self.cr_admin, {
            'username': 'newcr',
            'email': 'newcr@test.com',
            'password': 'pass123456',
            'team_ids': [self.team_a.id],
        })
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(User.objects.filter(username='newcr').exists())
        self.assertTrue(
            ControlRoomAccess.objects.filter(user__username='newcr').exists()
        )

    def test_cr_admin_can_search_eligible_existing_users(self):
        resp = self._eligible_users(self.cr_admin, query='target')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], 1)
        self.assertEqual(resp.data['results'][0], {
            'id': self.target.id,
            'username': self.target.username,
            'email': self.target.email,
            'full_name': self.target.get_full_name(),
        })

    def test_eligible_user_lookup_excludes_existing_and_inactive_users(self):
        ControlRoomAccess.objects.create(user=self.target)
        self.regular.is_active = False
        self.regular.save(update_fields=['is_active'])
        resp = self._eligible_users(self.cr_admin)
        self.assertEqual(resp.status_code, 200)
        returned_ids = {row['id'] for row in resp.data['results']}
        self.assertNotIn(self.target.id, returned_ids)
        self.assertNotIn(self.regular.id, returned_ids)

    def test_regular_user_cannot_use_eligible_user_lookup(self):
        resp = self._eligible_users(self.regular)
        self.assertEqual(resp.status_code, 403)

    def test_create_cr_user_hides_unexpected_exception_details(self):
        with patch(
            'apps.users.services.user_creation.create_user_with_profile',
            side_effect=RuntimeError('database secret details'),
        ):
            resp = self._create_cr_user(self.cr_admin, {
                'username': 'newcr',
                'email': 'newcr@test.com',
                'password': 'pass123456',
            })
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(
            resp.data,
            {'error': 'Failed to create Control Room user.'},
        )
        self.assertNotIn('database secret details', str(resp.data))

    def test_regular_user_cannot_list(self):
        resp = self._list(self.regular)
        self.assertEqual(resp.status_code, 403)

    def test_regular_user_cannot_create(self):
        resp = self._create(self.regular, {
            'user': self.target.id,
            'team_ids': [],
        })
        self.assertEqual(resp.status_code, 403)

    def test_regular_user_cannot_create_cr_user(self):
        resp = self._create_cr_user(self.regular, {
            'username': 'newcr2',
            'email': 'newcr2@test.com',
            'password': 'pass123456',
        })
        self.assertEqual(resp.status_code, 403)


class UpdateCRUserTests(TestCase):
    """Tests for the update_cr_user endpoint (CR admin simplified edit)."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.staff = _make_user('staff1', is_staff=True)
        self.cr_admin = _assign_cr_admin(_make_user('cradmin'))
        self.regular = _make_user('regular')
        self.target = _make_user('target')
        self.team_a = _make_team('Team A', 'A')
        self.team_b = _make_team('Team B', 'B')
        self.access = ControlRoomAccess.objects.create(
            user=self.target,
            is_active=True,
            created_by=self.staff,
            updated_by=self.staff,
        )
        ControlRoomTeamScope.objects.create(
            access=self.access, team=self.team_a, created_by=self.staff
        )

    def _update_cr_user(self, user, payload):
        request = self.factory.post(
            '/api/plugins/control_room/access/update_cr_user/', payload, format='json'
        )
        force_authenticate(request, user=user)
        return ControlRoomAccessViewSet.as_view({'post': 'update_cr_user'})(request)

    def test_cr_admin_can_update_basic_info(self):
        resp = self._update_cr_user(self.cr_admin, {
            'user_id': self.target.id,
            'first_name': 'NewFirst',
            'last_name': 'NewLast',
            'email': 'newemail@test.com',
            'phone': '1234567890',
        })
        self.assertEqual(resp.status_code, 200)
        self.target.refresh_from_db()
        self.assertEqual(self.target.first_name, 'NewFirst')
        self.assertEqual(self.target.last_name, 'NewLast')
        self.assertEqual(self.target.email, 'newemail@test.com')
        self.assertEqual(self.target.profile.phone, '1234567890')

    def test_cr_admin_can_replace_team_scopes(self):
        resp = self._update_cr_user(self.cr_admin, {
            'user_id': self.target.id,
            'team_ids': [self.team_b.id],
        })
        self.assertEqual(resp.status_code, 200)
        team_ids = set(self.access.team_scopes.values_list('team_id', flat=True))
        self.assertEqual(team_ids, {self.team_b.id})

    def test_cr_admin_can_clear_team_scopes(self):
        resp = self._update_cr_user(self.cr_admin, {
            'user_id': self.target.id,
            'team_ids': [],
        })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(self.access.team_scopes.count(), 0)

    def test_cr_admin_can_toggle_active(self):
        resp = self._update_cr_user(self.cr_admin, {
            'user_id': self.target.id,
            'is_active': False,
        })
        self.assertEqual(resp.status_code, 200)
        self.access.refresh_from_db()
        self.assertFalse(self.access.is_active)

    def test_staff_can_update_cr_user(self):
        resp = self._update_cr_user(self.staff, {
            'user_id': self.target.id,
            'first_name': 'StaffEdit',
        })
        self.assertEqual(resp.status_code, 200)
        self.target.refresh_from_db()
        self.assertEqual(self.target.first_name, 'StaffEdit')

    def test_update_omitted_fields_are_not_wiped(self):
        """Regression: fields not in the payload must NOT be overwritten."""
        self.target.first_name = 'KeepMe'
        self.target.last_name = 'KeepLast'
        self.target.email = 'keepme@test.com'
        self.target.profile.phone = '555-1234'
        self.target.profile.save()
        self.target.save()
        # Only update is_active, omit all other fields
        resp = self._update_cr_user(self.cr_admin, {
            'user_id': self.target.id,
            'is_active': False,
        })
        self.assertEqual(resp.status_code, 200)
        self.target.refresh_from_db()
        self.assertEqual(self.target.first_name, 'KeepMe')
        self.assertEqual(self.target.last_name, 'KeepLast')
        self.assertEqual(self.target.email, 'keepme@test.com')
        self.assertEqual(self.target.profile.phone, '555-1234')

    def test_serializer_exposes_basic_info_fields(self):
        """Serializer must expose first_name, last_name, phone for the edit form."""
        self.target.first_name = 'SerFirst'
        self.target.last_name = 'SerLast'
        self.target.profile.phone = '555-9999'
        self.target.profile.save()
        self.target.save()
        resp = self._update_cr_user(self.cr_admin, {
            'user_id': self.target.id,
        })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['first_name'], 'SerFirst')
        self.assertEqual(resp.data['last_name'], 'SerLast')
        self.assertEqual(resp.data['phone'], '555-9999')
        self.assertEqual(resp.data['email'], self.target.email)

    def test_cr_admin_can_edit_inactive_cr_user(self):
        """Regression: CR admin must be able to edit users with inactive access."""
        self.access.is_active = False
        self.access.save()
        resp = self._update_cr_user(self.cr_admin, {
            'user_id': self.target.id,
            'is_active': True,
        })
        self.assertEqual(resp.status_code, 200)
        self.access.refresh_from_db()
        self.assertTrue(self.access.is_active)

    def test_regular_user_cannot_update_cr_user(self):
        resp = self._update_cr_user(self.regular, {
            'user_id': self.target.id,
            'first_name': 'Hack',
        })
        self.assertEqual(resp.status_code, 403)

    def test_update_non_cr_user_returns_404(self):
        non_cr = _make_user('noncr')
        resp = self._update_cr_user(self.cr_admin, {
            'user_id': non_cr.id,
            'first_name': 'Test',
        })
        self.assertEqual(resp.status_code, 404)

    def test_update_missing_user_id_returns_400(self):
        resp = self._update_cr_user(self.cr_admin, {
            'first_name': 'Test',
        })
        self.assertEqual(resp.status_code, 400)

    def test_update_invalid_team_ids_returns_400(self):
        resp = self._update_cr_user(self.cr_admin, {
            'user_id': self.target.id,
            'team_ids': [99999],
        })
        self.assertEqual(resp.status_code, 400)

    def test_update_duplicate_team_ids_returns_400(self):
        resp = self._update_cr_user(self.cr_admin, {
            'user_id': self.target.id,
            'team_ids': [self.team_a.id, self.team_a.id],
        })
        self.assertEqual(resp.status_code, 400)


class CRAdminUsersFilterTests(TestCase):
    """CR admins see only users with ControlRoomAccess on the Users endpoint."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.staff = _make_user('staff1', is_staff=True)
        self.cr_admin = _assign_cr_admin(_make_user('cradmin'))
        self.regular = _make_user('regular')
        self.cr_user1 = _make_user('cruser1')
        self.cr_user2 = _make_user('cruser2')
        self.non_cr_user = _make_user('noncr')
        ControlRoomAccess.objects.create(user=self.cr_user1)
        ControlRoomAccess.objects.create(user=self.cr_user2)

    def _list(self, user):
        request = self.factory.get('/api/users/users/')
        force_authenticate(request, user=user)
        return UserViewSet.as_view({'get': 'list'})(request)

    def test_cr_admin_sees_only_cr_users(self):
        resp = self._list(self.cr_admin)
        self.assertEqual(resp.status_code, 200)
        results = resp.data.get('results', resp.data) if isinstance(resp.data, dict) else resp.data
        usernames = {u['username'] for u in results}
        self.assertIn('cruser1', usernames)
        self.assertIn('cruser2', usernames)
        self.assertNotIn('noncr', usernames)
        self.assertNotIn('regular', usernames)

    def test_cr_admin_with_hr_role_remains_cr_scoped(self):
        """A second non-staff role must not broaden CR-admin visibility."""
        self.cr_admin.profile.is_hr_user = True
        self.cr_admin.profile.save(update_fields=['is_hr_user'])

        resp = self._list(self.cr_admin)
        self.assertEqual(resp.status_code, 200)
        results = resp.data.get('results', resp.data) if isinstance(resp.data, dict) else resp.data
        usernames = {u['username'] for u in results}
        self.assertEqual(usernames, {'cruser1', 'cruser2'})

    def test_staff_sees_all_users(self):
        resp = self._list(self.staff)
        self.assertEqual(resp.status_code, 200)
        results = resp.data.get('results', resp.data) if isinstance(resp.data, dict) else resp.data
        usernames = {u['username'] for u in results}
        self.assertIn('cruser1', usernames)
        self.assertIn('noncr', usernames)

    def test_regular_user_sees_only_self(self):
        resp = self._list(self.regular)
        self.assertEqual(resp.status_code, 200)
        results = resp.data.get('results', resp.data) if isinstance(resp.data, dict) else resp.data
        usernames = {u['username'] for u in results}
        self.assertEqual(usernames, {'regular'})


class UserSerializerIsCRAdminTests(TestCase):
    def setUp(self):
        self.regular = _make_user('regular')
        self.cr_admin = _assign_cr_admin(_make_user('cradmin'))
        self.staff = _make_user('staff1', is_staff=True)

    def test_regular_user_is_cr_admin_false(self):
        data = UserSerializer(self.regular).data
        self.assertFalse(data['is_cr_admin'])

    def test_cr_admin_is_cr_admin_true(self):
        data = UserSerializer(self.cr_admin).data
        self.assertTrue(data['is_cr_admin'])

    def test_staff_is_cr_admin_true(self):
        data = UserSerializer(self.staff).data
        self.assertTrue(data['is_cr_admin'])


class ControlRoomAccessViewSetThrottleScopeTests(TestCase):
    """P2-2 regression: ControlRoomAccessViewSet must declare a throttle_scope."""

    def test_access_viewset_has_throttle_scope(self):
        self.assertEqual(
            ControlRoomAccessViewSet.throttle_scope, 'control_room'
        )


class ControlRoomAccessFilterCapTests(TestCase):
    """P2-3 regression: user_id__in CSV filter caps at 100 IDs."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.staff = _make_user('staff1', is_staff=True)

    def _list(self, user, query):
        request = self.factory.get('/api/plugins/control_room/access/?' + query)
        force_authenticate(request, user=user)
        return ControlRoomAccessViewSet.as_view({'get': 'list'})(request)

    def test_filter_accepts_within_cap(self):
        # 5 IDs — well under the cap of 100.
        resp = self._list(self.staff, 'user_id__in=1,2,3,4,5')
        self.assertEqual(resp.status_code, 200)

    def test_filter_rejects_over_cap(self):
        # 101 IDs — one over the cap.
        ids = ','.join(str(i) for i in range(1, 102))
        resp = self._list(self.staff, f'user_id__in={ids}')
        self.assertEqual(resp.status_code, 400)


class IsCRAdminPrefetchTests(TestCase):
    """P2-1 regression: is_cr_admin uses prefetched user_roles when available.

    Verifies that when ``user_roles__role`` is prefetched on a queryset,
    serializing many users does NOT issue a per-user query for the
    cr_admin role check (the prefetched cache path is taken instead).
    """

    def setUp(self):
        self.cr_admin = _assign_cr_admin(_make_user('cradmin'))
        self.regular = _make_user('regular')

    def test_is_cr_admin_uses_prefetched_cache(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        from django.contrib.auth.models import User

        # Prefetch user_roles__role so is_cr_admin takes the cache path.
        users = list(
            User.objects.prefetch_related('user_roles__role').filter(
                username__in=['cradmin', 'regular']
            )
        )
        with CaptureQueriesContext(connection) as captured:
            results = {u.username: is_cr_admin(u) for u in users}
        # No extra queries: the role check is resolved from the prefetched cache.
        self.assertEqual(len(captured.captured_queries), 0)
        self.assertTrue(results['cradmin'])
        self.assertFalse(results['regular'])

    def test_is_cr_admin_falls_back_to_query_without_prefetch(self):
        from django.contrib.auth.models import User
        user = User.objects.get(username='cradmin')
        # No prefetch — should still work via the EXISTS query fallback.
        self.assertTrue(is_cr_admin(user))


class CRAdminWritePathTests(TestCase):
    """is_cr_admin write path via create_user / update_user endpoints.

    Verifies that full admins can grant/revoke the cr_admin role through
    the standard user create/edit forms (no Django admin shell needed).
    """

    def setUp(self):
        self.factory = APIRequestFactory()
        self.staff = _make_user('staff1', is_staff=True)
        self.regular = _make_user('regular1')

    def _create_user(self, actor, payload):
        request = self.factory.post('/api/users/users/create_user/', payload, format='json')
        force_authenticate(request, user=actor)
        return UserViewSet.as_view({'post': 'create_user'})(request)

    def _update_user(self, actor, user_id, payload):
        request = self.factory.put(f'/api/users/users/{user_id}/update_user/', payload, format='json')
        force_authenticate(request, user=actor)
        return UserViewSet.as_view({'put': 'update_user'})(request, pk=user_id)

    def test_create_user_with_is_cr_admin_grants_role(self):
        resp = self._create_user(self.staff, {
            'username': 'newcradmin',
            'email': 'newcr@test.com',
            'password': 'testpass123',
            'is_cr_admin': True,
        })
        self.assertEqual(resp.status_code, 201)
        new_user = User.objects.get(username='newcradmin')
        self.assertTrue(is_cr_admin(new_user))
        # Idempotent: a second grant via update_user does not duplicate rows.
        resp2 = self._update_user(self.staff, new_user.id, {'is_cr_admin': True})
        self.assertEqual(resp2.status_code, 200)
        role = Role.objects.get(code='cr_admin')
        self.assertEqual(
            UserRole.objects.filter(user=new_user, role=role).count(), 1
        )

    def test_create_user_without_is_cr_admin_does_not_grant(self):
        resp = self._create_user(self.staff, {
            'username': 'plainuser',
            'email': 'plain@test.com',
            'password': 'testpass123',
        })
        self.assertEqual(resp.status_code, 201)
        self.assertFalse(is_cr_admin(User.objects.get(username='plainuser')))

    def test_update_user_revokes_cr_admin(self):
        # Grant then revoke.
        self._update_user(self.staff, self.regular.id, {'is_cr_admin': True})
        self.assertTrue(is_cr_admin(self.regular))
        self._update_user(self.staff, self.regular.id, {'is_cr_admin': False})
        self.regular.refresh_from_db()
        self.assertFalse(is_cr_admin(self.regular))
        # Row is deactivated, not deleted — audit history preserved.
        role = Role.objects.get(code='cr_admin')
        self.assertFalse(
            UserRole.objects.filter(user=self.regular, role=role, is_active=True).exists()
        )
        self.assertTrue(
            UserRole.objects.filter(user=self.regular, role=role, is_active=False).exists()
        )

    def test_update_user_omitting_is_cr_admin_leaves_role_unchanged(self):
        self._update_user(self.staff, self.regular.id, {'is_cr_admin': True})
        self.assertTrue(is_cr_admin(self.regular))
        # Update without is_cr_admin in payload — role must persist.
        self._update_user(self.staff, self.regular.id, {'first_name': 'Renamed'})
        self.regular.refresh_from_db()
        self.assertTrue(is_cr_admin(self.regular))
        self.assertEqual(self.regular.first_name, 'Renamed')


class BulkUpdateCRUsersTests(TestCase):
    """bulk_update_cr_users endpoint — same field set as update_cr_user
    minus per-user basic info (team_ids replace + is_active)."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.staff = _make_user('staff1', is_staff=True)
        self.cr_admin = _assign_cr_admin(_make_user('cradmin'))
        self.regular = _make_user('regular1')
        self.team_a = _make_team('Team A', 'TA')
        self.team_b = _make_team('Team B', 'TB')
        # Three CR users.
        self.u1 = _make_user('cr1')
        self.u2 = _make_user('cr2')
        self.u3 = _make_user('cr3')
        self.a1 = ControlRoomAccess.objects.create(user=self.u1, created_by=self.staff)
        self.a2 = ControlRoomAccess.objects.create(user=self.u2, created_by=self.staff)
        self.a3 = ControlRoomAccess.objects.create(user=self.u3, created_by=self.staff)

    def _bulk(self, actor, payload):
        request = self.factory.post(
            '/api/plugins/control_room/access/bulk_update_cr_users/',
            payload, format='json'
        )
        force_authenticate(request, user=actor)
        return ControlRoomAccessViewSet.as_view({'post': 'bulk_update_cr_users'})(request)

    def test_bulk_replace_team_scopes(self):
        resp = self._bulk(self.staff, {
            'user_ids': [self.u1.id, self.u2.id],
            'team_ids': [self.team_a.id, self.team_b.id],
        })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['updated_count'], 2)
        self.assertEqual(resp.data['failed_ids'], [])
        for access in (self.a1, self.a2):
            access.refresh_from_db()
            self.assertEqual(
                set(access.team_scopes.values_list('team_id', flat=True)),
                {self.team_a.id, self.team_b.id},
            )
        # u3 untouched.
        self.a3.refresh_from_db()
        self.assertEqual(self.a3.team_scopes.count(), 0)

    def test_bulk_clear_team_scopes_with_empty_list(self):
        # Seed scopes first.
        ControlRoomTeamScope.objects.create(access=self.a1, team=self.team_a)
        resp = self._bulk(self.staff, {'user_ids': [self.u1.id], 'team_ids': []})
        self.assertEqual(resp.status_code, 200)
        self.a1.refresh_from_db()
        self.assertEqual(self.a1.team_scopes.count(), 0)

    def test_bulk_toggle_is_active(self):
        resp = self._bulk(self.staff, {
            'user_ids': [self.u1.id, self.u2.id, self.u3.id],
            'is_active': False,
        })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['updated_count'], 3)
        for access in (self.a1, self.a2, self.a3):
            access.refresh_from_db()
            self.assertFalse(access.is_active)

    def test_bulk_combined_team_scopes_and_is_active(self):
        resp = self._bulk(self.cr_admin, {
            'user_ids': [self.u1.id],
            'team_ids': [self.team_a.id],
            'is_active': True,
        })
        self.assertEqual(resp.status_code, 200)
        self.a1.refresh_from_db()
        self.assertTrue(self.a1.is_active)
        self.assertEqual(
            set(self.a1.team_scopes.values_list('team_id', flat=True)),
            {self.team_a.id},
        )

    def test_bulk_rejects_empty_user_ids(self):
        resp = self._bulk(self.staff, {'user_ids': [], 'team_ids': [self.team_a.id]})
        self.assertEqual(resp.status_code, 400)

    def test_bulk_rejects_non_list_user_ids(self):
        resp = self._bulk(self.staff, {'user_ids': self.u1.id, 'team_ids': []})
        self.assertEqual(resp.status_code, 400)

    def test_bulk_rejects_over_cap(self):
        ids = list(range(1, 102))
        resp = self._bulk(self.staff, {'user_ids': ids, 'team_ids': []})
        self.assertEqual(resp.status_code, 400)

    def test_bulk_rejects_duplicates_in_user_ids(self):
        resp = self._bulk(self.staff, {
            'user_ids': [self.u1.id, self.u1.id],
            'team_ids': [],
        })
        self.assertEqual(resp.status_code, 400)

    def test_bulk_rejects_unknown_team_ids(self):
        resp = self._bulk(self.staff, {
            'user_ids': [self.u1.id],
            'team_ids': [999999],
        })
        self.assertEqual(resp.status_code, 400)

    def test_bulk_rejects_users_without_cr_access(self):
        no_cr = _make_user('nocr')
        resp = self._bulk(self.staff, {
            'user_ids': [self.u1.id, no_cr.id],
            'team_ids': [],
        })
        self.assertEqual(resp.status_code, 400)

    def test_bulk_rejects_no_op_payload(self):
        resp = self._bulk(self.staff, {'user_ids': [self.u1.id]})
        self.assertEqual(resp.status_code, 400)

    def test_bulk_regular_user_forbidden(self):
        resp = self._bulk(self.regular, {
            'user_ids': [self.u1.id],
            'team_ids': [self.team_a.id],
        })
        self.assertEqual(resp.status_code, 403)

    def test_bulk_cr_admin_allowed(self):
        resp = self._bulk(self.cr_admin, {
            'user_ids': [self.u1.id],
            'team_ids': [self.team_a.id],
        })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['updated_count'], 1)


class CRAdminUserProfileFilterTests(TestCase):
    """CR admins see only profiles of users with ControlRoomAccess on the
    /api/users/profiles/ endpoint (the endpoint the admin Users page
    actually calls). Regression for the bug where UserProfileViewSet
    lacked StaffFilterMixin and returned ALL profiles to CR admins.
    """

    def setUp(self):
        self.factory = APIRequestFactory()
        self.staff = _make_user('staff1', is_staff=True)
        self.cr_admin = _assign_cr_admin(_make_user('cradmin'))
        self.regular = _make_user('regular')
        self.cr_user1 = _make_user('cruser1')
        self.cr_user2 = _make_user('cruser2')
        self.non_cr_user = _make_user('noncr')
        ControlRoomAccess.objects.create(user=self.cr_user1)
        ControlRoomAccess.objects.create(user=self.cr_user2)

    def _list(self, user):
        from apps.users.viewsets import UserProfileViewSet
        request = self.factory.get('/api/users/profiles/')
        force_authenticate(request, user=user)
        return UserProfileViewSet.as_view({'get': 'list'})(request)

    def test_cr_admin_sees_only_cr_user_profiles(self):
        resp = self._list(self.cr_admin)
        self.assertEqual(resp.status_code, 200)
        results = resp.data.get('results', resp.data) if isinstance(resp.data, dict) else resp.data
        usernames = {p['user']['username'] for p in results}
        self.assertIn('cruser1', usernames)
        self.assertIn('cruser2', usernames)
        self.assertNotIn('noncr', usernames)
        self.assertNotIn('regular', usernames)

    def test_staff_sees_all_profiles(self):
        resp = self._list(self.staff)
        self.assertEqual(resp.status_code, 200)
        results = resp.data.get('results', resp.data) if isinstance(resp.data, dict) else resp.data
        usernames = {p['user']['username'] for p in results}
        self.assertIn('cruser1', usernames)
        self.assertIn('noncr', usernames)

    def test_regular_user_sees_only_own_profile(self):
        resp = self._list(self.regular)
        self.assertEqual(resp.status_code, 200)
        results = resp.data.get('results', resp.data) if isinstance(resp.data, dict) else resp.data
        usernames = {p['user']['username'] for p in results}
        self.assertEqual(usernames, {'regular'})


class UserSerializerHasControlRoomAccessTests(TestCase):
    """UserSerializer exposes has_control_room_access so the frontend can
    detect CR users (non-admin employees with ControlRoomAccess) at login
    time and hide standard employee nav. See CONTEXT.md rule 11.
    """

    def setUp(self):
        self.regular = _make_user('regular')
        self.cr_admin = _assign_cr_admin(_make_user('cradmin'))
        self.cr_user = _make_user('cruser')
        self.staff = _make_user('staff1', is_staff=True)
        ControlRoomAccess.objects.create(user=self.cr_user)
        # cr_admin also has an access record (multi-role: admin + user)
        ControlRoomAccess.objects.create(user=self.cr_admin)

    def test_regular_user_has_no_cr_access(self):
        data = UserSerializer(self.regular).data
        self.assertFalse(data['has_control_room_access'])

    def test_cr_user_has_cr_access(self):
        data = UserSerializer(self.cr_user).data
        self.assertTrue(data['has_control_room_access'])

    def test_cr_admin_with_access_record_has_cr_access(self):
        """is_cr_admin and has_control_room_access are independent flags."""
        data = UserSerializer(self.cr_admin).data
        self.assertTrue(data['is_cr_admin'])
        self.assertTrue(data['has_control_room_access'])

    def test_staff_without_access_record_has_no_cr_access(self):
        data = UserSerializer(self.staff).data
        self.assertFalse(data['has_control_room_access'])

    def test_inactive_access_record_is_false(self):
        access = ControlRoomAccess.objects.get(user=self.cr_user)
        access.is_active = False
        access.save()
        data = UserSerializer(self.cr_user).data
        self.assertFalse(data['has_control_room_access'])
