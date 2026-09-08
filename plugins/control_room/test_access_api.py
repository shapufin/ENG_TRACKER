"""
Phase 2 tests: access & scope management API + scope service.

API tests use APIRequestFactory + direct viewset calls (the established
pattern in this codebase — see plugins/ticket_kpi/test_ticket_kpi.py).
Plugin URLs are only registered at Django startup when the plugin is
active in the DB, so URL-based tests would 404 in the test runner.

Covers:
- Scope service: get_access_for_user, can_access_dashboard, can_manage_access,
  get_allowed_team_ids (None=global, set()=empty, set()=scoped).
- Access CRUD via viewset (admin only).
- Nested team-scope add/remove.
- /me endpoint for frontend nav decision.
- Permission enforcement: non-admin cannot manage; non-access user denied.
- Empty scope is NOT global scope (the critical invariant).
"""
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.permissions.models import Role, UserRole
from apps.users.models.core import Team, TeamMembership, UserProfile
from plugins.control_room.models import ControlRoomAccess, ControlRoomTeamScope
from plugins.control_room.services import scope_service
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


class ScopeServiceTests(TestCase):
    def setUp(self):
        self.admin = _make_user('admin1', is_staff=True)
        self.cr_user = _make_user('crops')
        self.no_access_user = _make_user('noaccess')
        self.inactive_user = _make_user('inactive', is_active=False)
        self.team_a = _make_team('Team A', 'A')
        self.team_b = _make_team('Team B', 'B')

    def test_get_access_for_user_no_record(self):
        self.assertIsNone(scope_service.get_access_for_user(self.cr_user))

    def test_get_access_for_user_with_active_record(self):
        access = ControlRoomAccess.objects.create(user=self.cr_user)
        self.assertEqual(scope_service.get_access_for_user(self.cr_user), access)

    def test_get_access_for_user_with_inactive_record(self):
        ControlRoomAccess.objects.create(user=self.cr_user, is_active=False)
        self.assertIsNone(scope_service.get_access_for_user(self.cr_user))

    def test_get_access_for_user_inactive_django_user(self):
        ControlRoomAccess.objects.create(user=self.inactive_user)
        self.assertIsNone(scope_service.get_access_for_user(self.inactive_user))

    def test_can_access_dashboard_admin_bypasses_access_record(self):
        self.assertTrue(scope_service.can_access_dashboard(self.admin))

    def test_can_access_dashboard_requires_active_access(self):
        self.assertFalse(scope_service.can_access_dashboard(self.cr_user))
        ControlRoomAccess.objects.create(user=self.cr_user)
        self.assertTrue(scope_service.can_access_dashboard(self.cr_user))

    def test_can_access_dashboard_inactive_access_denied(self):
        ControlRoomAccess.objects.create(user=self.cr_user, is_active=False)
        self.assertFalse(scope_service.can_access_dashboard(self.cr_user))

    def test_can_manage_access_admin_only(self):
        self.assertTrue(scope_service.can_manage_access(self.admin))
        self.assertFalse(scope_service.can_manage_access(self.cr_user))

    def test_get_allowed_team_ids_admin_returns_none_global(self):
        self.assertIsNone(scope_service.get_allowed_team_ids(self.admin))

    def test_get_allowed_team_ids_no_access_returns_empty_set(self):
        self.assertEqual(scope_service.get_allowed_team_ids(self.cr_user), set())

    def test_get_allowed_team_ids_empty_scope_returns_empty_set(self):
        """CRITICAL: empty scope must NOT be treated as global."""
        ControlRoomAccess.objects.create(user=self.cr_user)
        self.assertEqual(scope_service.get_allowed_team_ids(self.cr_user), set())

    def test_get_allowed_team_ids_scoped(self):
        access = ControlRoomAccess.objects.create(user=self.cr_user)
        ControlRoomTeamScope.objects.create(access=access, team=self.team_a)
        ControlRoomTeamScope.objects.create(access=access, team=self.team_b)
        self.assertEqual(
            scope_service.get_allowed_team_ids(self.cr_user),
            {self.team_a.id, self.team_b.id},
        )

    def test_is_team_in_scope_admin_always_true(self):
        self.assertTrue(scope_service.is_team_in_scope(self.admin, self.team_a.id))

    def test_is_team_in_scope_scoped_user(self):
        access = ControlRoomAccess.objects.create(user=self.cr_user)
        ControlRoomTeamScope.objects.create(access=access, team=self.team_a)
        self.assertTrue(scope_service.is_team_in_scope(self.cr_user, self.team_a.id))
        self.assertFalse(scope_service.is_team_in_scope(self.cr_user, self.team_b.id))

    def test_is_team_in_scope_empty_scope_user(self):
        ControlRoomAccess.objects.create(user=self.cr_user)
        self.assertFalse(scope_service.is_team_in_scope(self.cr_user, self.team_a.id))

    # --- CR admin dashboard scope (no ControlRoomAccess record) ---

    def test_can_access_dashboard_cr_admin_without_access_record(self):
        """A cr_admin without an access record may open the dashboard."""
        cr_admin = _assign_cr_admin(_make_user('cradmin'))
        self.assertTrue(scope_service.can_access_dashboard(cr_admin))

    def test_can_access_dashboard_inactive_cr_admin_role_denied(self):
        """An inactive cr_admin role without an access record is denied."""
        cr_admin = _assign_cr_admin(_make_user('cradmin2'))
        ur = UserRole.objects.get(user=cr_admin, role__code='cr_admin')
        ur.is_active = False
        ur.save()
        self.assertFalse(scope_service.can_access_dashboard(cr_admin))

    def test_get_allowed_team_ids_cr_admin_uses_own_memberships(self):
        """cr_admin without an access record is scoped to own team memberships."""
        cr_admin = _assign_cr_admin(_make_user('cradmin3'))
        TeamMembership.objects.create(user_profile=cr_admin.profile, team=self.team_a)
        self.assertEqual(
            scope_service.get_allowed_team_ids(cr_admin), {self.team_a.id}
        )

    def test_get_allowed_team_ids_cr_admin_no_memberships_is_empty(self):
        """Empty membership set is empty scope (NOT global) — the invariant."""
        cr_admin = _assign_cr_admin(_make_user('cradmin4'))
        self.assertEqual(scope_service.get_allowed_team_ids(cr_admin), set())

    def test_get_allowed_team_ids_cr_admin_with_access_record_takes_precedence(self):
        """A ControlRoomAccess record wins over own memberships for cr_admin."""
        cr_admin = _assign_cr_admin(_make_user('cradmin5'))
        TeamMembership.objects.create(user_profile=cr_admin.profile, team=self.team_a)
        access = ControlRoomAccess.objects.create(user=cr_admin)
        ControlRoomTeamScope.objects.create(access=access, team=self.team_b)
        self.assertEqual(
            scope_service.get_allowed_team_ids(cr_admin), {self.team_b.id}
        )

    def test_is_team_in_scope_cr_admin_own_membership(self):
        cr_admin = _assign_cr_admin(_make_user('cradmin6'))
        TeamMembership.objects.create(user_profile=cr_admin.profile, team=self.team_a)
        self.assertTrue(scope_service.is_team_in_scope(cr_admin, self.team_a.id))
        self.assertFalse(scope_service.is_team_in_scope(cr_admin, self.team_b.id))


class GetAllowedUserIdsTests(TestCase):
    def setUp(self):
        self.admin = _make_user('admin1', is_staff=True)
        self.team_a = _make_team('Team A', 'A')
        self.team_b = _make_team('Team B', 'B')
        self.u1 = _make_user('u1')
        self.u2 = _make_user('u2')
        self.u3 = _make_user('u3')
        TeamMembership.objects.create(user_profile=self.u1.profile, team=self.team_a)
        TeamMembership.objects.create(user_profile=self.u2.profile, team=self.team_a)
        TeamMembership.objects.create(user_profile=self.u3.profile, team=self.team_b)

    def test_global_scope_returns_all_team_members(self):
        ids = scope_service.get_allowed_user_ids(self.admin, team_ids=None)
        self.assertEqual(ids, {self.u1.id, self.u2.id, self.u3.id})

    def test_empty_scope_returns_empty_set(self):
        ids = scope_service.get_allowed_user_ids(self.admin, team_ids=set())
        self.assertEqual(ids, set())

    def test_scoped_returns_only_scoped_team_members(self):
        ids = scope_service.get_allowed_user_ids(self.admin, team_ids={self.team_a.id})
        self.assertEqual(ids, {self.u1.id, self.u2.id})


class AccessViewSetTests(TestCase):
    """Tests the ControlRoomAccessViewSet via APIRequestFactory."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.admin = _make_user('admin1', is_staff=True)
        self.target = _make_user('target')
        self.regular = _make_user('regular')
        self.cr_admin = _assign_cr_admin(_make_user('cradmin'))
        self.team_a = _make_team('Team A', 'A')
        self.team_b = _make_team('Team B', 'B')

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

    def _retrieve(self, user, pk):
        request = self.factory.get(f'/api/plugins/control_room/access/{pk}/')
        force_authenticate(request, user=user)
        return ControlRoomAccessViewSet.as_view({'get': 'retrieve'})(request, pk=pk)

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

    def _remove_team(self, user, pk, team_id):
        request = self.factory.delete(
            f'/api/plugins/control_room/access/{pk}/teams/{team_id}/'
        )
        force_authenticate(request, user=user)
        return ControlRoomAccessViewSet.as_view({'delete': 'remove_team'})(
            request, pk=pk, team_id=team_id
        )

    def _me(self, user):
        request = self.factory.get('/api/plugins/control_room/access/me/')
        force_authenticate(request, user=user)
        return ControlRoomAccessViewSet.as_view({'get': 'me'})(request)

    # --- List ---

    def test_list_as_admin(self):
        ControlRoomAccess.objects.create(user=self.target)
        resp = self._list(self.admin)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]['username'], 'target')

    def test_list_includes_team_ids(self):
        access = ControlRoomAccess.objects.create(user=self.target)
        ControlRoomTeamScope.objects.create(access=access, team=self.team_a)
        resp = self._list(self.admin)
        self.assertEqual(resp.data[0]['team_ids'], [self.team_a.id])

    def test_list_includes_nested_team_scopes(self):
        access = ControlRoomAccess.objects.create(user=self.target)
        ControlRoomTeamScope.objects.create(access=access, team=self.team_a)
        resp = self._list(self.admin)
        self.assertEqual(len(resp.data[0]['team_scopes']), 1)
        self.assertEqual(resp.data[0]['team_scopes'][0]['team_name'], 'Team A')

    def test_list_as_non_admin_forbidden(self):
        resp = self._list(self.regular)
        self.assertEqual(resp.status_code, 403)

    # --- Create ---

    def test_create_with_team_ids(self):
        resp = self._create(self.admin, {
            'user': self.target.id,
            'team_ids': [self.team_a.id, self.team_b.id],
        })
        self.assertEqual(resp.status_code, 201, resp.data)
        access = ControlRoomAccess.objects.get(user=self.target)
        self.assertTrue(access.is_active)
        self.assertEqual(
            set(access.team_scopes.values_list('team_id', flat=True)),
            {self.team_a.id, self.team_b.id},
        )
        self.assertEqual(access.created_by, self.admin)

    def test_create_without_team_ids(self):
        resp = self._create(self.admin, {'user': self.target.id})
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(
            ControlRoomAccess.objects.get(user=self.target).team_scopes.count(), 0
        )

    def test_create_duplicate_rejected(self):
        ControlRoomAccess.objects.create(user=self.target)
        resp = self._create(self.admin, {'user': self.target.id})
        self.assertEqual(resp.status_code, 400)

    def test_create_unknown_team_id_rejected(self):
        resp = self._create(self.admin, {
            'user': self.target.id,
            'team_ids': [999999],
        })
        self.assertEqual(resp.status_code, 400)

    def test_create_duplicate_team_ids_rejected(self):
        resp = self._create(self.admin, {
            'user': self.target.id,
            'team_ids': [self.team_a.id, self.team_a.id],
        })
        self.assertEqual(resp.status_code, 400)

    def test_create_as_non_admin_forbidden(self):
        resp = self._create(self.regular, {'user': self.target.id})
        self.assertEqual(resp.status_code, 403)

    # --- Update ---

    def test_partial_update_deactivate(self):
        access = ControlRoomAccess.objects.create(user=self.target)
        resp = self._partial_update(self.admin, access.id, {'is_active': False})
        self.assertEqual(resp.status_code, 200, resp.data)
        access.refresh_from_db()
        self.assertFalse(access.is_active)
        self.assertEqual(access.updated_by, self.admin)

    # --- Delete ---

    def test_delete_cascades_scopes(self):
        access = ControlRoomAccess.objects.create(user=self.target)
        scope = ControlRoomTeamScope.objects.create(access=access, team=self.team_a)
        resp = self._destroy(self.admin, access.id)
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(ControlRoomAccess.objects.filter(id=access.id).exists())
        self.assertFalse(ControlRoomTeamScope.objects.filter(id=scope.id).exists())

    # --- Nested team scope ---

    def test_add_team_scope(self):
        access = ControlRoomAccess.objects.create(user=self.target)
        resp = self._add_team(self.admin, access.id, {'team': self.team_a.id})
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['team_name'], 'Team A')
        self.assertTrue(
            ControlRoomTeamScope.objects.filter(access=access, team=self.team_a).exists()
        )

    def test_add_duplicate_team_scope_rejected(self):
        access = ControlRoomAccess.objects.create(user=self.target)
        ControlRoomTeamScope.objects.create(access=access, team=self.team_a)
        resp = self._add_team(self.admin, access.id, {'team': self.team_a.id})
        self.assertEqual(resp.status_code, 400)

    def test_add_subteams_scope_rejected_until_supported(self):
        access = ControlRoomAccess.objects.create(user=self.target)
        resp = self._add_team(
            self.admin,
            access.id,
            {'team': self.team_a.id, 'include_subteams': True},
        )
        self.assertEqual(resp.status_code, 400)

    def test_remove_team_scope(self):
        access = ControlRoomAccess.objects.create(user=self.target)
        ControlRoomTeamScope.objects.create(access=access, team=self.team_a)
        resp = self._remove_team(self.admin, access.id, self.team_a.id)
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(
            ControlRoomTeamScope.objects.filter(access=access, team=self.team_a).exists()
        )

    def test_remove_nonexistent_team_scope_404(self):
        access = ControlRoomAccess.objects.create(user=self.target)
        resp = self._remove_team(self.admin, access.id, self.team_a.id)
        self.assertEqual(resp.status_code, 404)

    # --- /me endpoint ---

    def test_me_admin_returns_global(self):
        resp = self._me(self.admin)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['has_access'])
        self.assertTrue(resp.data['is_global'])
        self.assertIsNone(resp.data['team_ids'])

    def test_me_no_access_user(self):
        resp = self._me(self.regular)
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data['has_access'])
        self.assertEqual(resp.data['team_ids'], [])

    def test_me_scoped_user(self):
        access = ControlRoomAccess.objects.create(user=self.regular)
        ControlRoomTeamScope.objects.create(access=access, team=self.team_a)
        resp = self._me(self.regular)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['has_access'])
        self.assertFalse(resp.data['is_global'])
        self.assertEqual(resp.data['team_ids'], [self.team_a.id])

    def test_me_empty_scope_user(self):
        """Empty scope: has_access=True but team_ids=[] (not None)."""
        ControlRoomAccess.objects.create(user=self.regular)
        resp = self._me(self.regular)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['has_access'])
        self.assertFalse(resp.data['is_global'])
        self.assertEqual(resp.data['team_ids'], [])

    def test_me_cr_admin_without_access_record_has_access(self):
        """cr_admin without an access record gets dashboard access scoped to
        their own team memberships (access payload is None)."""
        TeamMembership.objects.create(user_profile=self.cr_admin.profile, team=self.team_a)
        resp = self._me(self.cr_admin)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['has_access'])
        self.assertFalse(resp.data['is_global'])
        self.assertEqual(resp.data['team_ids'], [self.team_a.id])
        self.assertIsNone(resp.data['access'])

    def test_me_cr_admin_no_memberships_has_access_empty_scope(self):
        """cr_admin with no team memberships: has_access=True, team_ids=[]."""
        resp = self._me(self.cr_admin)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['has_access'])
        self.assertFalse(resp.data['is_global'])
        self.assertEqual(resp.data['team_ids'], [])

    def test_me_cr_admin_with_access_record_takes_precedence(self):
        """A ControlRoomAccess record wins over own memberships for cr_admin."""
        TeamMembership.objects.create(user_profile=self.cr_admin.profile, team=self.team_a)
        access = ControlRoomAccess.objects.create(user=self.cr_admin)
        ControlRoomTeamScope.objects.create(access=access, team=self.team_b)
        resp = self._me(self.cr_admin)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['has_access'])
        self.assertFalse(resp.data['is_global'])
        self.assertEqual(resp.data['team_ids'], [self.team_b.id])
        self.assertIsNotNone(resp.data['access'])


class CreateCRUserTests(TestCase):
    """Tests for the one-step create_cr_user endpoint."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.admin = _make_user('admin1', is_staff=True)
        self.regular = _make_user('regular')
        self.team_a = _make_team('Team A', 'A')
        self.team_b = _make_team('Team B', 'B')

    def _create_cr_user(self, user, payload):
        request = self.factory.post(
            '/api/plugins/control_room/access/create_cr_user/',
            payload, format='json',
        )
        force_authenticate(request, user=user)
        return ControlRoomAccessViewSet.as_view({'post': 'create_cr_user'})(request)

    def test_create_cr_user_success(self):
        resp = self._create_cr_user(self.admin, {
            'username': 'crops1',
            'email': 'crops1@example.com',
            'password': 'secret123',
            'first_name': 'Control',
            'last_name': 'Room',
            'team_ids': [self.team_a.id, self.team_b.id],
        })
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['username'], 'crops1')
        self.assertEqual(resp.data['first_name'], 'Control')
        self.assertEqual(resp.data['last_name'], 'Room')
        self.assertTrue(resp.data['is_active'])
        self.assertEqual(set(resp.data['team_ids']), {self.team_a.id, self.team_b.id})
        self.assertEqual(len(resp.data['team_scopes']), 2)
        # User really exists in DB and is a normal Django user.
        from django.contrib.auth.models import User
        self.assertTrue(User.objects.filter(username='crops1').exists())
        # Access + scopes created atomically.
        access = ControlRoomAccess.objects.get(user__username='crops1')
        self.assertEqual(access.team_scopes.count(), 2)

    def test_create_cr_user_empty_team_ids_no_scope(self):
        """Empty team_ids = access created but no visibility (not global)."""
        resp = self._create_cr_user(self.admin, {
            'username': 'crops2',
            'email': 'crops2@example.com',
            'password': 'secret123',
            'team_ids': [],
        })
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['team_ids'], [])
        access = ControlRoomAccess.objects.get(user__username='crops2')
        self.assertEqual(access.team_scopes.count(), 0)

    def test_create_cr_user_no_team_ids_key_defaults_empty(self):
        resp = self._create_cr_user(self.admin, {
            'username': 'crops3',
            'email': 'crops3@example.com',
            'password': 'secret123',
        })
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['team_ids'], [])

    def test_create_cr_user_duplicate_username_400(self):
        self._create_cr_user(self.admin, {
            'username': 'dup',
            'email': 'dup1@example.com',
            'password': 'secret123',
        })
        resp = self._create_cr_user(self.admin, {
            'username': 'dup',
            'email': 'dup2@example.com',
            'password': 'secret123',
        })
        self.assertEqual(resp.status_code, 400)
        self.assertIn('error', resp.data)
        # No partial access row left behind (atomicity).
        self.assertEqual(
            ControlRoomAccess.objects.filter(user__username='dup').count(), 1
        )

    def test_create_cr_user_duplicate_email_400(self):
        self._create_cr_user(self.admin, {
            'username': 'emaildup1',
            'email': 'shared@example.com',
            'password': 'secret123',
        })
        resp = self._create_cr_user(self.admin, {
            'username': 'emaildup2',
            'email': 'shared@example.com',
            'password': 'secret123',
        })
        self.assertEqual(resp.status_code, 400)

    def test_create_cr_user_unknown_team_ids_400(self):
        resp = self._create_cr_user(self.admin, {
            'username': 'crops4',
            'email': 'crops4@example.com',
            'password': 'secret123',
            'team_ids': [999999],
        })
        self.assertEqual(resp.status_code, 400)
        self.assertIn('Unknown team IDs', resp.data['error'])
        # Atomicity: no user/access created.
        self.assertFalse(
            ControlRoomAccess.objects.filter(user__username='crops4').exists()
        )

    def test_create_cr_user_duplicate_team_ids_400(self):
        resp = self._create_cr_user(self.admin, {
            'username': 'crops5',
            'email': 'crops5@example.com',
            'password': 'secret123',
            'team_ids': [self.team_a.id, self.team_a.id],
        })
        self.assertEqual(resp.status_code, 400)
        self.assertIn('duplicates', resp.data['error'])

    def test_create_cr_user_short_password_400(self):
        resp = self._create_cr_user(self.admin, {
            'username': 'crops6',
            'email': 'crops6@example.com',
            'password': '123',
        })
        self.assertEqual(resp.status_code, 400)

    def test_create_cr_user_missing_required_fields_400(self):
        resp = self._create_cr_user(self.admin, {'username': 'crops7'})
        self.assertEqual(resp.status_code, 400)
        self.assertIn('Missing required fields', resp.data['error'])

    def test_create_cr_user_team_ids_not_list_400(self):
        resp = self._create_cr_user(self.admin, {
            'username': 'crops8',
            'email': 'crops8@example.com',
            'password': 'secret123',
            'team_ids': 'not-a-list',
        })
        self.assertEqual(resp.status_code, 400)
        self.assertIn('must be a list', resp.data['error'])

    def test_create_cr_user_non_admin_403(self):
        resp = self._create_cr_user(self.regular, {
            'username': 'crops9',
            'email': 'crops9@example.com',
            'password': 'secret123',
        })
        self.assertEqual(resp.status_code, 403)

    def test_create_cr_user_display_name_persisted(self):
        resp = self._create_cr_user(self.admin, {
            'username': 'crops10',
            'email': 'crops10@example.com',
            'password': 'secret123',
            'display_name': 'Ops Console 1',
        })
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['display_name'], 'Ops Console 1')

    def test_create_cr_user_is_active_false(self):
        resp = self._create_cr_user(self.admin, {
            'username': 'crops11',
            'email': 'crops11@example.com',
            'password': 'secret123',
            'is_active': False,
        })
        self.assertEqual(resp.status_code, 201)
        self.assertFalse(resp.data['is_active'])


class AccessFilterByUserIdInTests(TestCase):
    """Tests for the user_id__in CSV filter (badge column query)."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.admin = _make_user('admin1', is_staff=True)
        self.u1 = _make_user('u1')
        self.u2 = _make_user('u2')
        self.u3 = _make_user('u3')
        self.a1 = ControlRoomAccess.objects.create(user=self.u1)
        self.a2 = ControlRoomAccess.objects.create(user=self.u2, is_active=False)

    def _list(self, user, query=''):
        url = '/api/plugins/control_room/access/'
        if query:
            url += f'?{query}'
        request = self.factory.get(url)
        force_authenticate(request, user=user)
        return ControlRoomAccessViewSet.as_view({'get': 'list'})(request)

    def test_filter_by_user_id_in(self):
        resp = self._list(
            self.admin, query=f'user_id__in={self.u1.id},{self.u3.id}'
        )
        self.assertEqual(resp.status_code, 200)
        usernames = [row['username'] for row in resp.data]
        self.assertEqual(usernames, ['u1'])

    def test_filter_by_user_id_in_multiple(self):
        resp = self._list(
            self.admin, query=f'user_id__in={self.u1.id},{self.u2.id}'
        )
        self.assertEqual(resp.status_code, 200)
        usernames = {row['username'] for row in resp.data}
        self.assertEqual(usernames, {'u1', 'u2'})

    def test_filter_user_id_in_with_is_active(self):
        resp = self._list(
            self.admin,
            query=f'user_id__in={self.u1.id},{self.u2.id}&is_active=true',
        )
        self.assertEqual(resp.status_code, 200)
        usernames = [row['username'] for row in resp.data]
        self.assertEqual(usernames, ['u1'])

    def test_filter_no_user_id_in_returns_all(self):
        resp = self._list(self.admin)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 2)
