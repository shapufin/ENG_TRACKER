from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from apps.overtime.models import Client
from apps.permissions.models import Role, UserRole
from apps.permissions.services.role_service import assign_role
from apps.users.models import Team, Tech

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


class TestUserTechAndRoleFacets(APITestCase):
    """Admin Users tech-facet filtering: ?tech=<id> filters the list,
    ?role=<tab> mirrors the UserFilterTabs values, and tech_facets/ returns
    live per-tech counts scoped by role+search but not by other tech picks."""

    def setUp(self):
        self.admin = User.objects.create_superuser(
            username='facet-admin', password='testpass123', email='facet-admin@example.com'
        )
        self.k8s = Tech.objects.create(name='Kubernetes', code='K8S')
        self.django_tech = Tech.objects.create(name='Django', code='DJANGO')

        self.tl_user = User.objects.create_user(username='facet-tl', password='testpass123')
        self.tl_user.profile.is_italian_tl_role = True
        self.tl_user.profile.save()
        self.tl_user.profile.techs.add(self.k8s)

        self.django_user = User.objects.create_user(username='facet-django', password='testpass123')
        self.django_user.profile.techs.add(self.django_tech)

        self.no_tech_user = User.objects.create_user(username='facet-none', password='testpass123')

        self.infra_team = Team.objects.create(name='Infrastructure', code='INFRA')
        self.tl_user.profile.teams.add(self.infra_team)

        self.client.force_authenticate(user=self.admin)

    def _usernames(self, response):
        return {p['user']['username'] for p in response.data['results']}

    def test_tech_filter_returns_only_matching_users(self):
        response = self.client.get('/api/users/profiles/', {'tech': self.k8s.id})
        self.assertEqual(response.status_code, 200)
        usernames = self._usernames(response)
        self.assertIn('facet-tl', usernames)
        self.assertNotIn('facet-django', usernames)
        self.assertNotIn('facet-none', usernames)

    def test_tech_filter_accepts_comma_joined_ids(self):
        # The frontend sends `tech=1,2` (not repeated `tech=1&tech=2`),
        # since axios serializes array params as `tech[]=1` by default,
        # which DRF's `getlist('tech')` wouldn't pick up.
        response = self.client.get(
            '/api/users/profiles/', {'tech': f'{self.k8s.id},{self.django_tech.id}'}
        )
        self.assertEqual(response.status_code, 200)
        usernames = self._usernames(response)
        self.assertIn('facet-tl', usernames)
        self.assertIn('facet-django', usernames)
        self.assertNotIn('facet-none', usernames)

    def test_role_filter_no_tl_excludes_team_leaders(self):
        response = self.client.get('/api/users/profiles/', {'role': 'no_tl'})
        self.assertEqual(response.status_code, 200)
        usernames = self._usernames(response)
        self.assertNotIn('facet-tl', usernames)
        self.assertIn('facet-django', usernames)

    def test_role_filter_italian_tl_matches_only_team_leaders(self):
        response = self.client.get('/api/users/profiles/', {'role': 'italian_tl'})
        self.assertEqual(response.status_code, 200)
        usernames = self._usernames(response)
        self.assertIn('facet-tl', usernames)
        self.assertNotIn('facet-django', usernames)

    def test_role_filter_hbpr_matches_only_hbpr_users(self):
        Role.objects.get_or_create(code='hbpr', defaults={'name': 'hbpr'})
        hbpr_user = User.objects.create_user(username='facet-hbpr', password='testpass123')
        assign_role(hbpr_user, 'hbpr')

        response = self.client.get('/api/users/profiles/', {'role': 'hbpr'})
        self.assertEqual(response.status_code, 200)
        usernames = self._usernames(response)
        self.assertIn('facet-hbpr', usernames)
        self.assertNotIn('facet-tl', usernames)
        self.assertNotIn('facet-django', usernames)
        self.assertNotIn('facet-none', usernames)

    def test_role_filter_employee_returns_only_plain_employees(self):
        # Elevated-role holders must not appear: TLs (flag, cache, or
        # dependents), HR (flag or cache), CR admin, HBPR.
        for code in ('hr', 'cr_admin', 'hbpr', 'albanian_tl'):
            Role.objects.get_or_create(code=code, defaults={'name': code})
        hr_flag = User.objects.create_user(username='facet-hr-flag', password='x')
        hr_flag.profile.is_hr_user = True
        hr_flag.profile.save()
        hr_role = User.objects.create_user(username='facet-hr-role', password='x')
        assign_role(hr_role, 'hr')
        cr_user = User.objects.create_user(username='facet-cr', password='x')
        assign_role(cr_user, 'cr_admin')
        hbpr_user = User.objects.create_user(username='facet-hbpr', password='x')
        assign_role(hbpr_user, 'hbpr')
        al_tl = User.objects.create_user(username='facet-altl', password='x')
        assign_role(al_tl, 'albanian_tl')
        # Functioning-as-TL via dependents but without any TL role flag.
        pseudo_tl = User.objects.create_user(username='facet-pseudo-tl', password='x')
        member = User.objects.create_user(username='facet-member', password='x')
        member.profile.italian_tl = pseudo_tl
        member.profile.save()

        response = self.client.get('/api/users/profiles/', {'role': 'employee'})
        self.assertEqual(response.status_code, 200)
        usernames = self._usernames(response)
        self.assertIn('facet-django', usernames)
        self.assertIn('facet-none', usernames)
        self.assertIn('facet-admin', usernames)
        self.assertIn('facet-member', usernames)
        for elevated in (
            'facet-tl', 'facet-hr-flag', 'facet-hr-role', 'facet-cr',
            'facet-hbpr', 'facet-altl', 'facet-pseudo-tl',
        ):
            self.assertNotIn(elevated, usernames)

    def test_role_filter_employee_includes_employee_with_tl_assigned(self):
        # "Employees" means no elevated ROLE — an employee whose own TL FK
        # points at a leader is still an employee (unlike no_tl, which is
        # the "unassigned" metric).
        self.django_user.profile.italian_tl = self.tl_user
        self.django_user.profile.save()

        response = self.client.get('/api/users/profiles/', {'role': 'employee'})
        self.assertEqual(response.status_code, 200)
        usernames = self._usernames(response)
        self.assertIn('facet-django', usernames)
        self.assertNotIn('facet-tl', usernames)

    def test_role_filter_hr_matches_hr_users_only(self):
        Role.objects.get_or_create(code='hr', defaults={'name': 'hr'})
        hr_flag = User.objects.create_user(username='facet-hr-flag', password='x')
        hr_flag.profile.is_hr_user = True
        hr_flag.profile.save()
        hr_role = User.objects.create_user(username='facet-hr-role', password='x')
        assign_role(hr_role, 'hr')

        response = self.client.get('/api/users/profiles/', {'role': 'hr'})
        self.assertEqual(response.status_code, 200)
        usernames = self._usernames(response)
        self.assertIn('facet-hr-flag', usernames)
        self.assertIn('facet-hr-role', usernames)
        self.assertNotIn('facet-tl', usernames)
        self.assertNotIn('facet-django', usernames)

    def test_role_filter_employee_includes_team_leader_without_role(self):
        """Documented definition: Employees excludes elevated ROLES only. A
        user who merely leads a Team row (no TL role/flag/FK) stays an
        employee — no other tab could classify them as IT or AL, so excluding
        them here would make them unreachable."""
        leader = User.objects.create_user(username='facet-led-team', password='x')
        Team.objects.create(name='Facet Led Team', code='FACET-LED', team_leader=leader)

        response = self.client.get('/api/users/profiles/', {'role': 'employee'})
        self.assertEqual(response.status_code, 200)
        self.assertIn('facet-led-team', self._usernames(response))
        # Staff/superusers are deliberately listed too — they hold no elevated
        # role and no other tab would show them.
        self.assertIn(self.admin.username, self._usernames(response))

    def test_role_filter_cr_admin_matches_cr_users_only(self):
        Role.objects.get_or_create(code='cr_admin', defaults={'name': 'cr_admin'})
        cr_user = User.objects.create_user(username='facet-cr', password='x')
        assign_role(cr_user, 'cr_admin')

        response = self.client.get('/api/users/profiles/', {'role': 'cr_admin'})
        self.assertEqual(response.status_code, 200)
        usernames = self._usernames(response)
        self.assertIn('facet-cr', usernames)
        self.assertNotIn('facet-tl', usernames)
        self.assertNotIn('facet-django', usernames)

    def test_tech_and_role_filters_combine(self):
        response = self.client.get(
            '/api/users/profiles/', {'role': 'italian_tl', 'tech': self.k8s.id}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._usernames(response), {'facet-tl'})

    def test_team_filter_returns_only_matching_users(self):
        response = self.client.get('/api/users/profiles/', {'team': self.infra_team.id})
        self.assertEqual(response.status_code, 200)
        usernames = self._usernames(response)
        self.assertIn('facet-tl', usernames)
        self.assertNotIn('facet-django', usernames)
        self.assertNotIn('facet-none', usernames)

    def test_team_and_tech_filters_combine(self):
        # Team narrows down further than tech alone — django_user has the
        # Django tech but is not on the Infrastructure team.
        response = self.client.get(
            '/api/users/profiles/', {'tech': self.k8s.id, 'team': self.infra_team.id}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._usernames(response), {'facet-tl'})

    def test_tech_facets_returns_per_tech_counts_and_no_tech_count(self):
        response = self.client.get('/api/users/profiles/tech_facets/')
        self.assertEqual(response.status_code, 200)
        counts = {f['id']: f['count'] for f in response.data['techs']}
        self.assertEqual(counts[self.k8s.id], 1)
        self.assertEqual(counts[self.django_tech.id], 1)
        self.assertGreaterEqual(response.data['no_tech_count'], 2)  # no_tech_user + admin

    def test_tech_facets_scoped_by_role_but_not_by_other_tech_selection(self):
        # role=italian_tl should scope the facet counts down...
        scoped = self.client.get('/api/users/profiles/tech_facets/', {'role': 'italian_tl'})
        scoped_counts = {f['id']: f['count'] for f in scoped.data['techs']}
        self.assertEqual(scoped_counts[self.k8s.id], 1)
        self.assertEqual(scoped_counts[self.django_tech.id], 0)

        # ...but selecting a tech chip itself must not zero out sibling counts.
        with_tech_selected = self.client.get(
            '/api/users/profiles/tech_facets/', {'tech': self.k8s.id}
        )
        sibling_counts = {f['id']: f['count'] for f in with_tech_selected.data['techs']}
        self.assertEqual(sibling_counts[self.django_tech.id], 1)

    def test_tech_facets_requires_auth(self):
        self.client.force_authenticate(user=None)
        response = self.client.get('/api/users/profiles/tech_facets/')
        self.assertEqual(response.status_code, 401)

    def test_no_tech_filter_returns_only_users_without_techs(self):
        # Server-side "No tech" match: must not depend on client-side
        # pagination truncation to find every no-tech profile.
        response = self.client.get('/api/users/profiles/', {'no_tech': 'true'})
        self.assertEqual(response.status_code, 200)
        usernames = self._usernames(response)
        self.assertIn('facet-none', usernames)
        self.assertIn('facet-admin', usernames)
        self.assertNotIn('facet-tl', usernames)
        self.assertNotIn('facet-django', usernames)

    def test_no_tech_filter_combines_with_role(self):
        response = self.client.get(
            '/api/users/profiles/', {'no_tech': 'true', 'role': 'italian_tl'}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._usernames(response), set())

    def test_tech_and_no_tech_params_together_prefer_no_tech(self):
        # Mutually exclusive facet values — no_tech wins if both are sent,
        # matching the frontend's own mutual-exclusion on selection.
        response = self.client.get(
            '/api/users/profiles/', {'no_tech': 'true', 'tech': self.k8s.id}
        )
        self.assertEqual(response.status_code, 200)
        usernames = self._usernames(response)
        self.assertIn('facet-none', usernames)
        self.assertNotIn('facet-tl', usernames)

    def test_profiles_list_page_size_covers_realistic_org_size(self):
        for i in range(60):
            User.objects.create_user(username=f'facet-bulk-{i}', password='testpass123')
        response = self.client.get('/api/users/profiles/')
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(response.data['count'], 63)
        self.assertGreaterEqual(len(response.data['results']), 63)


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

    def test_revoking_italian_tl_role_blocked_while_dependent_fk_remains(self):
        """Regression: turning off is_italian_tl_role while another user's
        profile still has italian_tl=this user must be blocked (400), not
        silently applied — otherwise the revoked user keeps functioning as
        TL for that dependent via the dangling FK."""
        self.first.profile.is_italian_tl_role = True
        self.first.profile.save()
        self.second.profile.italian_tl = self.first
        self.second.profile.save()

        response = self.client.post(
            '/api/users/users/bulk_update/',
            {'user_ids': [self.first.id], 'is_italian_tl_role': False},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('bulk-second', response.data['error'])
        self.first.profile.refresh_from_db()
        self.assertTrue(self.first.profile.is_italian_tl_role)

    def test_revoke_block_response_includes_structured_dependents(self):
        """The frontend cascade-block modal needs structured data (not just
        a formatted error string) to list dependents and let the admin
        reassign/clear them inline."""
        self.first.profile.is_italian_tl_role = True
        self.first.profile.save()
        self.second.profile.italian_tl = self.first
        self.second.profile.save()

        response = self.client.post(
            '/api/users/users/bulk_update/',
            {'user_ids': [self.first.id], 'is_italian_tl_role': False},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        blocked = response.data['blocked_revocations']
        self.assertEqual(len(blocked), 1)
        self.assertEqual(blocked[0]['user_id'], self.first.id)
        self.assertEqual(blocked[0]['username'], 'bulk-first')
        self.assertEqual(blocked[0]['role'], 'italian_tl')
        self.assertEqual(
            [d['user_id'] for d in blocked[0]['dependents']], [self.second.id]
        )
        self.assertEqual(
            [d['username'] for d in blocked[0]['dependents']], ['bulk-second']
        )
        self.assertEqual(
            [d['profile_id'] for d in blocked[0]['dependents']],
            [self.second.profile.id],
        )

    def test_revoking_albanian_tl_role_blocked_while_dependent_fk_remains(self):
        self.first.profile.is_albanian_tl_role = True
        self.first.profile.save()
        self.second.profile.albanian_tl = self.first
        self.second.profile.save()

        response = self.client.post(
            '/api/users/users/bulk_update/',
            {'user_ids': [self.first.id], 'is_albanian_tl_role': False},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.first.profile.refresh_from_db()
        self.assertTrue(self.first.profile.is_albanian_tl_role)

    def test_revoking_tl_role_succeeds_once_no_dependents_remain(self):
        self.first.profile.is_italian_tl_role = True
        self.first.profile.save()
        # second's FK points elsewhere, not at first — no dependent.

        response = self.client.post(
            '/api/users/users/bulk_update/',
            {'user_ids': [self.first.id], 'is_italian_tl_role': False},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.first.profile.refresh_from_db()
        self.assertFalse(self.first.profile.is_italian_tl_role)

    def test_turning_tl_role_on_is_never_blocked(self):
        """Only revoke (True->False) is dangerous; assigning (False->True)
        must never be blocked by dependent checks."""
        self.second.profile.italian_tl = self.first
        self.second.profile.save()

        response = self.client.post(
            '/api/users/users/bulk_update/',
            {'user_ids': [self.first.id], 'is_italian_tl_role': True},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.first.profile.refresh_from_db()
        self.assertTrue(self.first.profile.is_italian_tl_role)

    def _open_hbpr_assignment(self, hbpr_user, tl_user):
        from datetime import date

        from apps.users.models.hbpr import HbprAlbanianTlAssignment

        for code in ('hbpr', 'albanian_tl'):
            Role.objects.get_or_create(code=code, defaults={'name': code})
        assign_role(hbpr_user, 'hbpr')
        assign_role(tl_user, 'albanian_tl')
        return HbprAlbanianTlAssignment.objects.create(
            hbpr=hbpr_user, albanian_tl=tl_user, cadence='weekly',
            effective_from=date(2026, 10, 1),
        )

    def test_bulk_is_hbpr_grants_and_revokes_hbpr_role(self):
        Role.objects.get_or_create(code='hbpr', defaults={'name': 'hbpr'})

        response = self.client.post(
            '/api/users/users/bulk_update/',
            {'user_ids': [self.first.id, self.second.id], 'is_hbpr': True},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        for user in (self.first, self.second):
            self.assertTrue(
                UserRole.objects.filter(
                    user=user, role__code='hbpr', is_active=True
                ).exists()
            )

        response = self.client.post(
            '/api/users/users/bulk_update/',
            {'user_ids': [self.first.id], 'is_hbpr': False},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(
            UserRole.objects.filter(
                user=self.first, role__code='hbpr', is_active=True
            ).exists()
        )
        self.assertTrue(
            UserRole.objects.filter(
                user=self.second, role__code='hbpr', is_active=True
            ).exists()
        )

    def test_bulk_is_hbpr_rejects_non_bool(self):
        response = self.client.post(
            '/api/users/users/bulk_update/',
            {'user_ids': [self.first.id], 'is_hbpr': 'yes'},
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_revoking_hbpr_blocked_by_open_assignment(self):
        tl = User.objects.create_user(username='bulk-altl', password='x')
        self._open_hbpr_assignment(self.first, tl)

        response = self.client.post(
            '/api/users/users/bulk_update/',
            {'user_ids': [self.first.id], 'is_hbpr': False},
            format='json',
        )

        self.assertEqual(response.status_code, 400, response.data)
        blocked = response.data['blocked_revocations']
        self.assertEqual(len(blocked), 1)
        self.assertEqual(blocked[0]['user_id'], self.first.id)
        self.assertEqual(blocked[0]['role'], 'hbpr')
        self.assertEqual(blocked[0]['assignment_count'], 1)
        self.assertTrue(
            UserRole.objects.filter(
                user=self.first, role__code='hbpr', is_active=True
            ).exists()
        )

    def test_revoking_albanian_tl_blocked_by_open_hbpr_assignment(self):
        """Regression: bulk_update revoking albanian_tl on a TL with an open
        HBPR assignment hit the guard inside revoke_role and returned a 500;
        it must be a structured 400 with blocked_revocations, like the
        single-user update path."""
        self.first.profile.is_albanian_tl_role = True
        self.first.profile.save()
        self._open_hbpr_assignment(self.second, self.first)

        response = self.client.post(
            '/api/users/users/bulk_update/',
            {'user_ids': [self.first.id], 'is_albanian_tl_role': False},
            format='json',
        )

        self.assertEqual(response.status_code, 400, response.data)
        blocked = response.data['blocked_revocations']
        self.assertEqual(len(blocked), 1)
        self.assertEqual(blocked[0]['user_id'], self.first.id)
        self.assertEqual(blocked[0]['role'], 'albanian_tl')
        self.assertEqual(blocked[0]['assignment_count'], 1)
        self.first.profile.refresh_from_db()
        self.assertTrue(self.first.profile.is_albanian_tl_role)

    def test_bulk_revoke_hbpr_tolerates_missing_role_seed(self):
        """If the hbpr Role row was never seeded, a revoke request is a
        harmless no-op (no UserRole can exist without the Role), not a 500."""
        Role.objects.filter(code='hbpr').delete()
        response = self.client.post(
            '/api/users/users/bulk_update/',
            {'user_ids': [self.first.id], 'is_hbpr': False},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)

    def test_mid_batch_tech_failure_writes_nothing(self):
        """The in-loop TechAssignmentError return must roll the whole batch
        back — previously the first profile's teams.set committed before the
        guard fired, contradicting the documented all-or-nothing contract."""
        retired = Tech.objects.create(name='Bulk Retired', code='BULK-RETIRED', is_active=False)
        # Seed BOTH profiles: UserProfile has no Meta.ordering, so whichever row
        # is processed first must stay unchanged for this to catch a missing
        # rollback.
        self.first.profile.teams.set([self.team_a])
        self.second.profile.teams.set([self.team_a])

        response = self.client.post(
            '/api/users/users/bulk_update/',
            {
                'user_ids': [self.first.id, self.second.id],
                'teams': [self.team_b.id],
                'techs': [{'tech': retired.id, 'level': None}],
            },
            format='json',
        )

        self.assertEqual(response.status_code, 400, response.data)
        for user in (self.first, self.second):
            user.profile.refresh_from_db()
            self.assertEqual(
                set(user.profile.teams.values_list('id', flat=True)), {self.team_a.id}
            )


class TestUpdateUserTlRevokeCascadeBlock(APITestCase):
    """update_user must apply the same TL-revoke dependent block as
    bulk_update — both mutate is_italian_tl_role/is_albanian_tl_role and
    both must not leave a dangling FK behind a revoked TL."""

    def setUp(self):
        self.admin = User.objects.create_superuser(
            username='update-admin', password='testpass123', email='admin@example.com'
        )
        self.tl = User.objects.create_user(username='update-tl', password='testpass123')
        self.dependent = User.objects.create_user(username='update-dep', password='testpass123')
        self.client.force_authenticate(user=self.admin)

    def test_update_user_with_unseeded_hbpr_role_returns_400(self):
        """_sync_roles raises ValueError for an unseeded managed role;
        update_user must translate it to 400 the way create_user does."""
        Role.objects.filter(code='hbpr').delete()

        response = self.client.patch(
            f'/api/users/users/{self.tl.id}/update_user/',
            {'roles': ['hbpr']},
            format='json',
        )

        self.assertEqual(response.status_code, 400, response.data)

    def test_revoking_italian_tl_role_blocked_while_dependent_fk_remains(self):
        self.tl.profile.is_italian_tl_role = True
        self.tl.profile.save()
        self.dependent.profile.italian_tl = self.tl
        self.dependent.profile.save()

        response = self.client.patch(
            f'/api/users/users/{self.tl.id}/update_user/',
            {'is_italian_tl_role': False},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.tl.profile.refresh_from_db()
        self.assertTrue(self.tl.profile.is_italian_tl_role)

    def test_revoke_block_response_includes_structured_dependents(self):
        self.tl.profile.is_italian_tl_role = True
        self.tl.profile.save()
        self.dependent.profile.italian_tl = self.tl
        self.dependent.profile.save()

        response = self.client.patch(
            f'/api/users/users/{self.tl.id}/update_user/',
            {'is_italian_tl_role': False},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        blocked = response.data['blocked_revocations']
        self.assertEqual(len(blocked), 1)
        self.assertEqual(blocked[0]['user_id'], self.tl.id)
        self.assertEqual(blocked[0]['username'], 'update-tl')
        self.assertEqual(blocked[0]['role'], 'italian_tl')
        self.assertEqual(
            [d['user_id'] for d in blocked[0]['dependents']], [self.dependent.id]
        )
        self.assertEqual(
            [d['profile_id'] for d in blocked[0]['dependents']],
            [self.dependent.profile.id],
        )

    def test_revoking_tl_role_succeeds_once_no_dependents_remain(self):
        self.tl.profile.is_italian_tl_role = True
        self.tl.profile.save()

        response = self.client.patch(
            f'/api/users/users/{self.tl.id}/update_user/',
            {'is_italian_tl_role': False},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.tl.profile.refresh_from_db()
        self.assertFalse(self.tl.profile.is_italian_tl_role)

    def test_revoking_via_roles_array_blocked_while_dependent_fk_remains(self):
        """The real edit-user form (frontend/src/pages/admin/hooks/
        useUsersPage.ts) sends `roles` alongside the legacy booleans on
        every save — `roles` drives the actual outcome via _sync_roles, so
        the block must key off it too, not just the legacy flags."""
        self.tl.profile.is_italian_tl_role = True
        self.tl.profile.role_codes = ['italian_tl']
        self.tl.profile.save()
        self.dependent.profile.italian_tl = self.tl
        self.dependent.profile.save()

        response = self.client.patch(
            f'/api/users/users/{self.tl.id}/update_user/',
            # Mirrors the real payload shape: legacy flag stays True (form
            # doesn't necessarily flip it) while `roles` no longer lists it.
            {'is_italian_tl_role': True, 'roles': []},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.tl.profile.refresh_from_db()
        self.assertTrue(self.tl.profile.is_italian_tl_role)

    def test_revoking_via_roles_array_succeeds_once_no_dependents_remain(self):
        self.tl.profile.is_italian_tl_role = True
        self.tl.profile.role_codes = ['italian_tl']
        self.tl.profile.save()

        response = self.client.patch(
            f'/api/users/users/{self.tl.id}/update_user/',
            {'is_italian_tl_role': False, 'roles': []},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.tl.profile.refresh_from_db()
        self.assertFalse(self.tl.profile.is_italian_tl_role)

    def test_blocked_even_when_role_granted_via_role_codes_not_legacy_flag(self):
        """Regression: a TL role granted via assign_role() directly (e.g.
        apps/users/management/commands/seed_e2e_data.py) sets role_codes but
        leaves is_italian_tl_role False. A PATCH with roles=[] must still be
        blocked while a dependent exists — the block can't rely on the
        legacy flag alone."""
        self.tl.profile.role_codes = ['italian_tl']
        self.tl.profile.save()
        self.dependent.profile.italian_tl = self.tl
        self.dependent.profile.save()

        response = self.client.patch(
            f'/api/users/users/{self.tl.id}/update_user/',
            {'roles': []},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('blocked_revocations', response.data)


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

    def test_tl_assigns_multiple_clients(self):
        self.client.force_authenticate(user=self.tl)
        response = self.client.post(
            self.url(self.member.id),
            {'client_ids': [self.active_a.id, self.active_b.id]},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.assigned(self.member), {self.active_a.id, self.active_b.id})

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


class TestTeamCreateUpdateAdminOnly(APITestCase):
    """Team writes are admin-only: the HR-native /hr/teams page and its IsHR
    grant on create/update/partial_update were removed. HR keeps read access
    (HR Reports uses teams/list_for_reports) but can no longer write; destroy
    and the cross-team calendar-group bulk actions stay admin-only, see
    TestTeamCalendarGroupAdminOnly."""

    def setUp(self):
        self.hr = User.objects.create_user(username='team-hr', password='testpass123')
        self.hr.profile.is_hr_user = True
        self.hr.profile.save()
        self.employee = User.objects.create_user(username='team-emp', password='testpass123')
        self.team = Team.objects.create(name='HR Team', code='HRT')

    def test_hr_can_still_list_teams(self):
        """Read stays IsAuthenticated - HR Reports and holidays depend on it."""
        self.client.force_authenticate(user=self.hr)
        response = self.client.get('/api/users/teams/')
        self.assertEqual(response.status_code, 200, response.data)

    def test_hr_cannot_create_team(self):
        self.client.force_authenticate(user=self.hr)
        response = self.client.post(
            '/api/users/teams/',
            {'name': 'New Team', 'code': 'NEW'},
            format='json',
        )
        self.assertEqual(response.status_code, 403, response.data)

    def test_hr_cannot_update_team(self):
        self.client.force_authenticate(user=self.hr)
        response = self.client.patch(
            f'/api/users/teams/{self.team.id}/',
            {'name': 'Renamed Team'},
            format='json',
        )
        self.assertEqual(response.status_code, 403, response.data)

    def test_hr_cannot_set_calendar_group_via_update(self):
        """HR is refused before the serializer: no create/update grant at all."""
        self.client.force_authenticate(user=self.hr)
        response = self.client.patch(
            f'/api/users/teams/{self.team.id}/',
            {'calendar_group': 'hr-snuck-in'},
            format='json',
        )
        self.assertEqual(response.status_code, 403, response.data)
        self.team.refresh_from_db()
        self.assertNotEqual(self.team.calendar_group, 'hr-snuck-in')

    def test_hr_cannot_set_calendar_group_via_create(self):
        self.client.force_authenticate(user=self.hr)
        response = self.client.post(
            '/api/users/teams/',
            {'name': 'New Team', 'code': 'NEW2', 'calendar_group': 'hr-snuck-in'},
            format='json',
        )
        self.assertEqual(response.status_code, 403, response.data)

    def test_admin_can_still_set_calendar_group_via_update(self):
        admin = User.objects.create_superuser(
            username='team-admin', password='testpass123', email='admin2@example.com'
        )
        self.client.force_authenticate(user=admin)
        response = self.client.patch(
            f'/api/users/teams/{self.team.id}/',
            {'calendar_group': 'admin-set'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.team.refresh_from_db()
        self.assertEqual(self.team.calendar_group, 'admin-set')

    def test_hr_cannot_delete_team(self):
        self.client.force_authenticate(user=self.hr)
        response = self.client.delete(f'/api/users/teams/{self.team.id}/')
        self.assertEqual(response.status_code, 403)

    def test_plain_employee_cannot_create_team(self):
        self.client.force_authenticate(user=self.employee)
        response = self.client.post(
            '/api/users/teams/',
            {'name': 'Blocked Team', 'code': 'BLK'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)


class TestSetTeamLeaderHRAssignment(APITestCase):
    """HR's narrow TL-assignment action on UserProfileViewSet: set/clear
    which TL an EXISTING employee reports to. Distinct from the TL-role
    revoke cascade block (TestBulkUpdateUsers/TestUpdateUserTlRevokeCascadeBlock)
    — this writes the employee's own italian_tl/albanian_tl FK, it does not
    touch anyone's is_italian_tl_role/is_albanian_tl_role flag."""

    def setUp(self):
        self.hr = User.objects.create_user(username='setup-hr', password='testpass123')
        self.hr.profile.is_hr_user = True
        self.hr.profile.save()

        self.employee = User.objects.create_user(username='setup-emp', password='testpass123')

        self.tl = User.objects.create_user(username='setup-tl', password='testpass123')
        self.tl.profile.is_italian_tl_role = True
        self.tl.profile.save()

        self.non_tl = User.objects.create_user(username='setup-nontl', password='testpass123')

        self.plain_employee = User.objects.create_user(
            username='setup-plain', password='testpass123'
        )

    def _url(self, profile_id):
        return f'/api/users/profiles/{profile_id}/set_team_leader/'

    def test_hr_can_assign_italian_tl(self):
        self.client.force_authenticate(user=self.hr)
        response = self.client.post(
            self._url(self.employee.profile.id),
            {'role': 'italian_tl', 'team_leader_user_id': self.tl.id},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.employee.profile.refresh_from_db()
        self.assertEqual(self.employee.profile.italian_tl_id, self.tl.id)

    def test_hr_can_clear_italian_tl(self):
        self.employee.profile.italian_tl = self.tl
        self.employee.profile.save()

        self.client.force_authenticate(user=self.hr)
        response = self.client.post(
            self._url(self.employee.profile.id),
            {'role': 'italian_tl', 'team_leader_user_id': None},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.employee.profile.refresh_from_db()
        self.assertIsNone(self.employee.profile.italian_tl_id)

    def test_rejects_non_tl_user_as_assignment_target(self):
        self.client.force_authenticate(user=self.hr)
        response = self.client.post(
            self._url(self.employee.profile.id),
            {'role': 'italian_tl', 'team_leader_user_id': self.non_tl.id},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.employee.profile.refresh_from_db()
        self.assertIsNone(self.employee.profile.italian_tl_id)

    def test_rejects_invalid_role(self):
        self.client.force_authenticate(user=self.hr)
        response = self.client.post(
            self._url(self.employee.profile.id),
            {'role': 'hr', 'team_leader_user_id': self.tl.id},
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_rejects_unknown_team_leader_user_id(self):
        self.client.force_authenticate(user=self.hr)
        response = self.client.post(
            self._url(self.employee.profile.id),
            {'role': 'italian_tl', 'team_leader_user_id': 999999},
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_plain_employee_forbidden(self):
        self.client.force_authenticate(user=self.plain_employee)
        response = self.client.post(
            self._url(self.employee.profile.id),
            {'role': 'italian_tl', 'team_leader_user_id': self.tl.id},
            format='json',
        )
        self.assertEqual(response.status_code, 403)
        self.employee.profile.refresh_from_db()
        self.assertIsNone(self.employee.profile.italian_tl_id)

    def test_anonymous_forbidden(self):
        response = self.client.post(
            self._url(self.employee.profile.id),
            {'role': 'italian_tl', 'team_leader_user_id': self.tl.id},
            format='json',
        )
        self.assertIn(response.status_code, (401, 403))

    def test_admin_can_assign(self):
        admin = User.objects.create_superuser(
            username='setup-admin', password='testpass123', email='setup-admin@example.com'
        )
        self.client.force_authenticate(user=admin)
        response = self.client.post(
            self._url(self.employee.profile.id),
            {'role': 'albanian_tl', 'team_leader_user_id': None},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
