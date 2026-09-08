from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from apps.overtime.models import Client
from apps.users.models import Team

User = get_user_model()


class TestJWTSecurity(APITestCase):
    """P1-1/P1-2: JWT hardening — refresh rotation, blacklist, logout, throttle."""

    def setUp(self):
        self.user = User.objects.create_user(
            username='jwtuser', password='testpass123', email='jwt@example.com'
        )

    def test_refresh_token_rotates(self):
        """P1-1: refresh token rotation returns a new refresh token."""
        response = self.client.post('/api/auth/token/', {
            'username': 'jwtuser', 'password': 'testpass123'
        })
        old_refresh = response.cookies['refresh_token'].value

        response = self.client.post('/api/auth/token/refresh/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.data)
        self.assertIn('refresh_token', response.cookies)
        new_refresh = response.cookies['refresh_token'].value
        self.assertNotEqual(old_refresh, new_refresh)

    def test_old_refresh_blacklisted_after_rotation(self):
        """P1-1: old refresh token is blacklisted after rotation."""
        response = self.client.post('/api/auth/token/', {
            'username': 'jwtuser', 'password': 'testpass123'
        })
        old_refresh = response.cookies['refresh_token'].value

        # Rotate
        self.client.cookies['refresh_token'] = old_refresh
        self.client.post('/api/auth/token/refresh/')

        # Old refresh should now be blacklisted
        self.client.cookies['refresh_token'] = old_refresh
        response = self.client.post('/api/auth/token/refresh/')
        self.assertEqual(response.status_code, 401)

    def test_logout_blacklists_refresh(self):
        """P1-1: logout endpoint blacklists the refresh token."""
        response = self.client.post('/api/auth/token/', {
            'username': 'jwtuser', 'password': 'testpass123'
        })
        refresh = response.cookies['refresh_token'].value
        access = response.data['access']

        response = self.client.post(
            '/api/auth/token/logout/',
            HTTP_AUTHORIZATION=f'Bearer {access}'
        )
        self.assertEqual(response.status_code, 200)

        # Refresh token should now be unusable
        self.client.cookies['refresh_token'] = refresh
        response = self.client.post('/api/auth/token/refresh/')
        self.assertEqual(response.status_code, 401)


class TestUserAPI(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123',
            first_name='Test',
            last_name='User'
        )

    def test_login_endpoint(self):
        response = self.client.post('/api/auth/token/', {
            'username': 'testuser',
            'password': 'testpass123'
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.data)
        self.assertNotIn('refresh', response.data)
        self.assertIn('user', response.data)

    def test_login_invalid_credentials(self):
        response = self.client.post('/api/auth/token/', {
            'username': 'testuser',
            'password': 'wrongpassword'
        })
        self.assertEqual(response.status_code, 401)

    def test_user_list_requires_auth(self):
        response = self.client.get('/api/users/')
        self.assertEqual(response.status_code, 401)

    def test_user_list_with_auth(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/users/')
        self.assertEqual(response.status_code, 200)


class TestBulkUpdateUsers(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username='bulk-admin', password='testpass123', email='admin@example.com'
        )
        self.first = User.objects.create_user(username='bulk-first', password='testpass123')
        self.second = User.objects.create_user(username='bulk-second', password='testpass123')
        self.team_a = Team.objects.create(name='Bulk Team A', code='BULK-A')
        self.team_b = Team.objects.create(name='Bulk Team B', code='BULK-B')
        self.client.force_authenticate(user=self.admin)

    def test_updates_multiple_users_with_multi_team_and_role_fields(self):
        response = self.client.post(
            '/api/users/users/bulk_update/',
            {
                'user_ids': [self.first.id, self.second.id],
                'teams': [self.team_a.id, self.team_b.id],
                'is_hr': True,
                'is_italian_tl_role': True,
                'is_albanian_tl_role': False,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['updated_count'], 2)
        for user in (self.first, self.second):
            user.refresh_from_db()
            self.assertEqual(
                set(user.profile.teams.values_list('id', flat=True)),
                {self.team_a.id, self.team_b.id},
            )
            self.assertTrue(user.profile.is_hr_user)
            self.assertTrue(user.profile.is_italian_tl_role)
            self.assertFalse(user.profile.is_albanian_tl_role)

    def test_omitted_fields_remain_unchanged(self):
        self.first.profile.teams.set([self.team_a])
        self.first.profile.is_hr_user = True
        self.first.profile.save()

        response = self.client.post(
            '/api/users/users/bulk_update/',
            {'user_ids': [self.first.id], 'teams': [self.team_b.id]},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.first.refresh_from_db()
        self.assertEqual(set(self.first.profile.teams.values_list('id', flat=True)), {self.team_b.id})
        self.assertTrue(self.first.profile.is_hr_user)

    def test_can_clear_all_teams(self):
        self.first.profile.teams.set([self.team_a, self.team_b])

        response = self.client.post(
            '/api/users/users/bulk_update/',
            {'user_ids': [self.first.id], 'teams': []},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.first.profile.teams.count(), 0)

    def test_rejects_unknown_team_without_changing_users(self):
        self.first.profile.teams.set([self.team_a])

        response = self.client.post(
            '/api/users/users/bulk_update/',
            {'user_ids': [self.first.id], 'teams': [999999]},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            set(self.first.profile.teams.values_list('id', flat=True)),
            {self.team_a.id},
        )

    def test_requires_full_admin(self):
        self.client.force_authenticate(user=self.first)
        response = self.client.post(
            '/api/users/users/bulk_update/',
            {'user_ids': [self.second.id], 'teams': [self.team_a.id]},
            format='json',
        )
        self.assertEqual(response.status_code, 403)


class TestAssignClients(APITestCase):
    """Self-assignment of clients from the Settings page."""

    def setUp(self):
        self.user = User.objects.create_user(
            username='emp', password='testpass123'
        )
        self.active_a = Client.objects.create(name='Client A', code='A', is_active=True)
        self.active_b = Client.objects.create(name='Client B', code='B', is_active=True)
        self.inactive = Client.objects.create(name='Client C', code='C', is_active=False)
        self.client.force_authenticate(user=self.user)

    def test_assign_clients_sets_profile_clients(self):
        response = self.client.post(
            '/api/users/users/assign_clients/',
            {'client_ids': [self.active_a.id, self.active_b.id]},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            set(self.user.profile.clients.values_list('id', flat=True)),
            {self.active_a.id, self.active_b.id},
        )
        # Response includes updated client_ids for frontend refresh
        self.assertEqual(set(response.data['client_ids']), {self.active_a.id, self.active_b.id})

    def test_assign_clients_rejects_inactive(self):
        response = self.client.post(
            '/api/users/users/assign_clients/',
            {'client_ids': [self.active_a.id, self.inactive.id]},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertNotIn(self.inactive.id, self.user.profile.clients.values_list('id', flat=True))

    def test_assign_clients_rejects_unknown_id(self):
        response = self.client.post(
            '/api/users/users/assign_clients/',
            {'client_ids': [999999]},
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_assign_clients_rejects_non_list(self):
        response = self.client.post(
            '/api/users/users/assign_clients/',
            {'client_ids': self.active_a.id},
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_assign_clients_requires_auth(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(
            '/api/users/users/assign_clients/',
            {'client_ids': []},
            format='json',
        )
        self.assertEqual(response.status_code, 401)

    def test_assign_clients_can_clear(self):
        # First assign
        self.user.profile.clients.set([self.active_a.id])
        # Then clear
        response = self.client.post(
            '/api/users/users/assign_clients/',
            {'client_ids': []},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.user.profile.clients.count(), 0)


class TestAssignMemberClients(APITestCase):
    """TL/admin assignment of a team member's clients (Settings card).

    Plan: plan-tl-client-assignment-2026-09-04 §7.1. Route does not exist
    yet — every case except anon/404 must FAIL until the action lands.
    """

    def setUp(self):
        self.tl = User.objects.create_user(username='tl', password='testpass123')
        self.member = User.objects.create_user(username='mem', password='testpass123')
        self.outsider = User.objects.create_user(username='out', password='testpass123')
        self.hr = User.objects.create_user(username='hr', password='testpass123')
        self.hr.profile.is_hr_user = True
        self.hr.profile.save()
        self.admin = User.objects.create_superuser(
            username='admin', password='testpass123', email='admin@example.com'
        )
        # Scope: member reports to tl via direct FK (get_team_member_ids).
        self.member.profile.italian_tl = self.tl
        self.member.profile.save()
        self.active_a = Client.objects.create(name='Client A', code='A', is_active=True)
        self.active_b = Client.objects.create(name='Client B', code='B', is_active=True)
        self.inactive = Client.objects.create(name='Client C', code='C', is_active=False)

    def url(self, user_id):
        return f'/api/users/users/{user_id}/assign_member_clients/'

    def assigned(self, user):
        return set(user.profile.clients.values_list('id', flat=True))

    def test_tl_assigns_in_scope_member(self):
        self.client.force_authenticate(user=self.tl)
        response = self.client.post(
            self.url(self.member.id), {'client_ids': [self.active_a.id]}, format='json'
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.assigned(self.member), {self.active_a.id})
        self.assertEqual(set(response.data['client_ids']), {self.active_a.id})

    def test_tl_clears(self):
        self.member.profile.clients.set([self.active_a.id])
        self.client.force_authenticate(user=self.tl)
        response = self.client.post(self.url(self.member.id), {'client_ids': []}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.assigned(self.member), set())

    def test_tl_out_of_scope_403(self):
        self.client.force_authenticate(user=self.tl)
        response = self.client.post(
            self.url(self.outsider.id), {'client_ids': [self.active_a.id]}, format='json'
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.assigned(self.outsider), set())

    def test_pure_hr_403(self):
        self.client.force_authenticate(user=self.hr)
        response = self.client.post(
            self.url(self.member.id), {'client_ids': [self.active_a.id]}, format='json'
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.assigned(self.member), set())

    def test_tl_hr_multi_role_allowed(self):
        # is_hr_only exempts TL+HR: elevated role keeps write privileges.
        self.tl.profile.is_hr_user = True
        self.tl.profile.save()
        self.client.force_authenticate(user=self.tl)
        response = self.client.post(
            self.url(self.member.id), {'client_ids': [self.active_a.id]}, format='json'
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.assigned(self.member), {self.active_a.id})

    def test_staff_200_any_target(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            self.url(self.outsider.id), {'client_ids': [self.active_b.id]}, format='json'
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.assigned(self.outsider), {self.active_b.id})

    def test_plain_employee_403(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.post(
            self.url(self.member.id), {'client_ids': [self.active_a.id]}, format='json'
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.assigned(self.member), set())

    def test_requires_auth(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(
            self.url(self.member.id), {'client_ids': [self.active_a.id]}, format='json'
        )
        self.assertEqual(response.status_code, 401)

    def test_rejects_two_ids(self):
        self.client.force_authenticate(user=self.tl)
        response = self.client.post(
            self.url(self.member.id),
            {'client_ids': [self.active_a.id, self.active_b.id]},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.assigned(self.member), set())

    def test_rejects_inactive_and_unknown(self):
        self.client.force_authenticate(user=self.tl)
        for bad in ([self.inactive.id], [999999]):
            response = self.client.post(
                self.url(self.member.id), {'client_ids': bad}, format='json'
            )
            self.assertEqual(response.status_code, 400)
        self.assertEqual(self.assigned(self.member), set())

    def test_rejects_non_list(self):
        self.client.force_authenticate(user=self.tl)
        response = self.client.post(
            self.url(self.member.id), {'client_ids': self.active_a.id}, format='json'
        )
        self.assertEqual(response.status_code, 400)

    def test_unknown_pk_404(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            '/api/users/users/999999/assign_member_clients/',
            {'client_ids': [self.active_a.id]},
            format='json',
        )
        self.assertEqual(response.status_code, 404)


class TestAvailableClients(APITestCase):
    """The `available` action returns all active clients for the picker."""

    def setUp(self):
        self.user = User.objects.create_user(username='emp', password='testpass123')
        Client.objects.create(name='Active A', code='AA', is_active=True)
        Client.objects.create(name='Active B', code='AB', is_active=True)
        Client.objects.create(name='Inactive', code='IN', is_active=False)
        self.client.force_authenticate(user=self.user)

    def test_available_returns_only_active(self):
        response = self.client.get('/api/overtime/clients/available/')
        self.assertEqual(response.status_code, 200)
        names = [c['name'] for c in response.data]
        self.assertIn('Active A', names)
        self.assertIn('Active B', names)
        self.assertNotIn('Inactive', names)

    def test_available_requires_auth(self):
        self.client.force_authenticate(user=None)
        response = self.client.get('/api/overtime/clients/available/')
        self.assertEqual(response.status_code, 401)


class TestTeamCalendarGroupAdminOnly(APITestCase):
    """Calendar-group bulk mutations must be admin-only.

    ``bulk_update_calendar_group``, ``rename_calendar_group`` and
    ``clear_calendar_group`` mutate calendar groups across ALL teams. They
    were previously gated by ``IsAuthenticated`` only, allowing any
    authenticated employee to rename/clear every team's calendar group.
    """

    def setUp(self):
        self.employee = User.objects.create_user(
            username='emp', password='testpass123'
        )
        self.admin = User.objects.create_superuser(
            username='admin', password='testpass123', email='admin@example.com'
        )
        Team.objects.create(name='Team A', code='A', calendar_group='grp1')
        Team.objects.create(name='Team B', code='B', calendar_group='grp1')

    def test_bulk_update_calendar_group_rejects_employee(self):
        self.client.force_authenticate(user=self.employee)
        response = self.client.post(
            '/api/users/teams/bulk_update_calendar_group/',
            {'team_ids': [1], 'calendar_group': 'grp2'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_rename_calendar_group_rejects_employee(self):
        self.client.force_authenticate(user=self.employee)
        response = self.client.post(
            '/api/users/teams/rename_calendar_group/',
            {'old_name': 'grp1', 'new_name': 'grp2'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_clear_calendar_group_rejects_employee(self):
        self.client.force_authenticate(user=self.employee)
        response = self.client.post(
            '/api/users/teams/clear_calendar_group/',
            {'calendar_group': 'grp1'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_bulk_update_calendar_group_allows_admin(self):
        self.client.force_authenticate(user=self.admin)
        team = Team.objects.get(code='A')
        response = self.client.post(
            '/api/users/teams/bulk_update_calendar_group/',
            {'team_ids': [team.id], 'calendar_group': 'grp2'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        team.refresh_from_db()
        self.assertEqual(team.calendar_group, 'grp2')
