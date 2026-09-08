"""Tests for the scalable Resource Access group directory/member APIs.

Covers the directory/detail redesign:
- Group directory returns ``member_count`` via DB annotation (no N+1).
- Group directory supports server-side search and pagination.
- Member list is group-scoped, paginated, and searchable.
- Add-member user search excludes existing members and is paginated.
- Missing group returns 404.
- Staff read access preserved; staff/regular-user mutation denied.
- Duplicate membership returns a structured 400, not 500.
- Invalid user/group IDs return 400.
- Existing plugin group permission behavior remains unchanged.
"""
from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.permissions.models import Group, UserGroup
from apps.plugins.models import PluginPermission


class GroupDirectoryTests(APITestCase):
    def setUp(self):
        self.superuser = User.objects.create_superuser(
            username='dir-su', password='testpass', email='dsu@example.com'
        )
        self.staff = User.objects.create_user(
            username='dir-staff', password='testpass', is_staff=True
        )
        self.regular = User.objects.create_user(
            username='dir-regular', password='testpass'
        )
        self.group_a = Group.objects.create(
            name='Analytics Viewers', code='ANALYTICS',
            description='Read-only analytics access',
        )
        self.group_b = Group.objects.create(
            name='Payroll Managers', code='PAYROLL',
        )
        self.empty_group = Group.objects.create(
            name='Empty Group', code='EMPTY',
        )
        # Add members to group_a (2) and group_b (1).
        self.u1 = User.objects.create_user(username='member1', password='p')
        self.u2 = User.objects.create_user(username='member2', password='p')
        self.u3 = User.objects.create_user(username='member3', password='p')
        UserGroup.objects.create(user=self.u1, group=self.group_a)
        UserGroup.objects.create(user=self.u2, group=self.group_a)
        UserGroup.objects.create(user=self.u3, group=self.group_b)

    def test_directory_returns_member_count(self):
        self.client.force_authenticate(self.staff)
        resp = self.client.get('/api/permissions/groups/')
        self.assertEqual(resp.status_code, 200)
        by_code = {g['code']: g for g in resp.data['results']}
        self.assertEqual(by_code['ANALYTICS']['member_count'], 2)
        self.assertEqual(by_code['PAYROLL']['member_count'], 1)
        self.assertEqual(by_code['EMPTY']['member_count'], 0)

    def test_directory_shows_plugin_access_summary(self):
        PluginPermission.objects.create(
            plugin_name='analytics', action='view',
        ).allowed_groups.add(self.group_a)
        PluginPermission.objects.create(
            plugin_name='analytics', action='export',
        ).allowed_groups.add(self.group_a)
        self.client.force_authenticate(self.staff)
        resp = self.client.get('/api/permissions/groups/')
        access = next(
            row['plugin_access'] for row in resp.data['results'] if row['code'] == 'ANALYTICS'
        )
        self.assertEqual(
            access,
            [
                {'plugin_name': 'analytics', 'action': 'export'},
                {'plugin_name': 'analytics', 'action': 'view'},
            ],
        )

    def test_staff_cannot_bulk_delete_groups(self):
        self.client.force_authenticate(self.staff)
        resp = self.client.post(
            '/api/permissions/groups/bulk_delete/',
            {'ids': [self.group_a.id]},
            format='json',
        )
        self.assertEqual(resp.status_code, 403)
        self.assertTrue(Group.objects.filter(pk=self.group_a.pk).exists())

    def test_superuser_bulk_delete_removes_memberships_and_group_grants(self):
        permission = PluginPermission.objects.create(
            plugin_name='analytics', action='view',
        )
        permission.allowed_groups.add(self.group_a)
        self.client.force_authenticate(self.superuser)
        resp = self.client.post(
            '/api/permissions/groups/bulk_delete/',
            {'ids': [self.group_a.id, self.group_b.id]},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['deleted_count'], 2)
        self.assertFalse(Group.objects.filter(pk=self.group_a.pk).exists())
        self.assertFalse(UserGroup.objects.filter(group_id=self.group_a.pk).exists())
        self.assertNotIn(self.group_a.id, list(permission.allowed_groups.values_list('id', flat=True)))
        self.assertTrue(Group.objects.filter(pk=self.empty_group.pk).exists())

    def test_bulk_delete_requires_a_nonempty_integer_id_list(self):
        self.client.force_authenticate(self.superuser)
        for payload in ({'ids': []}, {'ids': [True]}, {'ids': [999999]}):
            resp = self.client.post(
                '/api/permissions/groups/bulk_delete/', payload, format='json',
            )
            self.assertEqual(resp.status_code, 400)
        self.assertTrue(Group.objects.filter(pk=self.group_a.pk).exists())

    def test_directory_member_count_updates_after_add(self):
        self.client.force_authenticate(self.superuser)
        User.objects.create_user(username='newm', password='p')
        new_user = User.objects.get(username='newm')
        self.client.post(
            '/api/permissions/user-groups/',
            {'user': new_user.id, 'group': self.empty_group.id},
            format='json',
        )
        resp = self.client.get('/api/permissions/groups/')
        by_code = {g['code']: g for g in resp.data['results']}
        self.assertEqual(by_code['EMPTY']['member_count'], 1)

    def test_directory_search_by_name(self):
        self.client.force_authenticate(self.staff)
        resp = self.client.get('/api/permissions/groups/?search=Analytics')
        self.assertEqual(resp.status_code, 200)
        codes = {g['code'] for g in resp.data['results']}
        self.assertIn('ANALYTICS', codes)
        self.assertNotIn('PAYROLL', codes)

    def test_directory_search_by_code(self):
        self.client.force_authenticate(self.staff)
        resp = self.client.get('/api/permissions/groups/?search=PAYROLL')
        self.assertEqual(resp.status_code, 200)
        codes = {g['code'] for g in resp.data['results']}
        self.assertEqual(codes, {'PAYROLL'})

    def test_directory_pagination(self):
        # Create enough groups to exceed default page size (50).
        for i in range(60):
            Group.objects.create(name=f'Page Group {i:02d}', code=f'PG{i:02d}')
        self.client.force_authenticate(self.staff)
        resp = self.client.get('/api/permissions/groups/?page=1')
        self.assertEqual(resp.status_code, 200)
        self.assertLessEqual(len(resp.data['results']), 50)
        self.assertIsNotNone(resp.data['next'])
        resp2 = self.client.get('/api/permissions/groups/?page=2')
        self.assertEqual(resp2.status_code, 200)
        self.assertGreater(len(resp2.data['results']), 0)

    def test_directory_honours_page_size_param(self):
        """The client-supplied ``page_size`` must be honoured, not ignored.

        Regression guard: the global paginator has ``PAGE_SIZE=50`` and no
        ``page_size_query_param``, so viewsets inheriting it silently ignore
        ``?page_size=``. The directory sends ``page_size=25`` and computes
        total pages from it, so the backend must respect the override.
        """
        for i in range(60):
            Group.objects.create(name=f'Size Group {i:02d}', code=f'SG{i:02d}')
        self.client.force_authenticate(self.staff)
        resp = self.client.get('/api/permissions/groups/?page=1&page_size=25')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['results']), 25)
        self.assertIsNotNone(resp.data['next'])

    def test_directory_page_size_clamped_to_max(self):
        """``page_size`` above the paginator max is clamped, not blown up."""
        for i in range(60):
            Group.objects.create(name=f'Clamp Group {i:02d}', code=f'CG{i:02d}')
        self.client.force_authenticate(self.staff)
        resp = self.client.get('/api/permissions/groups/?page=1&page_size=10000')
        self.assertEqual(resp.status_code, 200)
        self.assertLessEqual(len(resp.data['results']), 100)

    def test_directory_detail_returns_member_count(self):
        self.client.force_authenticate(self.staff)
        resp = self.client.get(f'/api/permissions/groups/{self.group_a.id}/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['member_count'], 2)

    def test_directory_missing_group_returns_404(self):
        self.client.force_authenticate(self.superuser)
        resp = self.client.get('/api/permissions/groups/999999/')
        self.assertEqual(resp.status_code, 404)


class MemberListTests(APITestCase):
    def setUp(self):
        self.superuser = User.objects.create_superuser(
            username='mem-su', password='testpass', email='msu@example.com'
        )
        self.staff = User.objects.create_user(
            username='mem-staff', password='testpass', is_staff=True
        )
        self.group_a = Group.objects.create(name='Group A', code='GRP_A')
        self.group_b = Group.objects.create(name='Group B', code='GRP_B')
        self.u1 = User.objects.create_user(
            username='alice', password='p', first_name='Alice', last_name='Smith',
            email='alice@example.com',
        )
        self.u2 = User.objects.create_user(
            username='bob', password='p', first_name='Bob', last_name='Jones',
            email='bob@example.com',
        )
        self.u3 = User.objects.create_user(
            username='carol', password='p', first_name='Carol', last_name='Lee',
        )
        UserGroup.objects.create(user=self.u1, group=self.group_a)
        UserGroup.objects.create(user=self.u2, group=self.group_a)
        UserGroup.objects.create(user=self.u3, group=self.group_b)

    def test_member_list_is_group_scoped(self):
        self.client.force_authenticate(self.staff)
        resp = self.client.get(
            f'/api/permissions/user-groups/?group={self.group_a.id}'
        )
        self.assertEqual(resp.status_code, 200)
        usernames = {m['user_name'] for m in resp.data['results']}
        self.assertEqual(usernames, {'alice', 'bob'})

    def test_member_list_search(self):
        self.client.force_authenticate(self.staff)
        resp = self.client.get(
            f'/api/permissions/user-groups/?group={self.group_a.id}&search=Alice'
        )
        self.assertEqual(resp.status_code, 200)
        usernames = {m['user_name'] for m in resp.data['results']}
        self.assertEqual(usernames, {'alice'})

    def test_member_list_pagination(self):
        # Add 60 members to group_a.
        for i in range(60):
            u = User.objects.create_user(username=f'extra{i:02d}', password='p')
            UserGroup.objects.create(user=u, group=self.group_a)
        self.client.force_authenticate(self.staff)
        resp = self.client.get(
            f'/api/permissions/user-groups/?group={self.group_a.id}&page=1'
        )
        self.assertEqual(resp.status_code, 200)
        self.assertLessEqual(len(resp.data['results']), 50)
        self.assertIsNotNone(resp.data['next'])

    def test_member_list_honours_page_size_param(self):
        """The client-supplied ``page_size`` must be honoured on member lists."""
        for i in range(60):
            u = User.objects.create_user(username=f'size{i:02d}', password='p')
            UserGroup.objects.create(user=u, group=self.group_a)
        self.client.force_authenticate(self.staff)
        resp = self.client.get(
            f'/api/permissions/user-groups/?group={self.group_a.id}&page=1&page_size=25'
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['results']), 25)
        self.assertIsNotNone(resp.data['next'])

    def test_member_list_without_group_filter_returns_all_paginated(self):
        """Without a group filter, the endpoint still paginates (no unbounded load)."""
        self.client.force_authenticate(self.staff)
        resp = self.client.get('/api/permissions/user-groups/')
        self.assertEqual(resp.status_code, 200)
        self.assertLessEqual(len(resp.data['results']), 50)


class AddMemberUserSearchTests(APITestCase):
    def setUp(self):
        self.superuser = User.objects.create_superuser(
            username='search-su', password='testpass', email='ssu@example.com'
        )
        self.group = Group.objects.create(name='Search Group', code='SRCH')
        self.member_user = User.objects.create_user(
            username='existing', password='p', first_name='Existing',
            last_name='Member', email='existing@example.com',
        )
        UserGroup.objects.create(user=self.member_user, group=self.group)
        self.candidate = User.objects.create_user(
            username='candidate', password='p', first_name='Candi',
            last_name='Date', email='candi@example.com',
        )
        # Inactive user should be excluded by default.
        self.inactive = User.objects.create_user(
            username='inactive', password='p', is_active=False,
        )

    def test_user_search_excludes_existing_members(self):
        self.client.force_authenticate(self.superuser)
        resp = self.client.get(
            f'/api/permissions/groups/{self.group.id}/member_candidates/?search=existing'
        )
        self.assertEqual(resp.status_code, 200)
        ids = {u['id'] for u in resp.data['results']}
        self.assertNotIn(self.member_user.id, ids)

    def test_user_search_returns_candidates(self):
        self.client.force_authenticate(self.superuser)
        resp = self.client.get(
            f'/api/permissions/groups/{self.group.id}/member_candidates/?search=candi'
        )
        self.assertEqual(resp.status_code, 200)
        ids = {u['id'] for u in resp.data['results']}
        self.assertIn(self.candidate.id, ids)

    def test_user_search_excludes_inactive_by_default(self):
        self.client.force_authenticate(self.superuser)
        resp = self.client.get(
            f'/api/permissions/groups/{self.group.id}/member_candidates/?search=inactive'
        )
        self.assertEqual(resp.status_code, 200)
        ids = {u['id'] for u in resp.data['results']}
        self.assertNotIn(self.inactive.id, ids)

    def test_user_search_is_paginated(self):
        for i in range(60):
            User.objects.create_user(
                username=f'bulk{i:02d}', password='p',
                first_name=f'Bulk{i:02d}', last_name='User',
            )
        self.client.force_authenticate(self.superuser)
        resp = self.client.get(
            f'/api/permissions/groups/{self.group.id}/member_candidates/?search=bulk&page_size=10'
        )
        self.assertEqual(resp.status_code, 200)
        self.assertLessEqual(len(resp.data['results']), 10)
        self.assertIsNotNone(resp.data['next'])

    def test_user_search_staff_can_access(self):
        staff = User.objects.create_user(
            username='search-staff', password='p', is_staff=True,
        )
        self.client.force_authenticate(staff)
        resp = self.client.get(
            f'/api/permissions/groups/{self.group.id}/member_candidates/?search=candi'
        )
        self.assertEqual(resp.status_code, 200)

    def test_user_search_regular_user_denied(self):
        regular = User.objects.create_user(username='search-regular', password='p')
        self.client.force_authenticate(regular)
        resp = self.client.get(
            f'/api/permissions/groups/{self.group.id}/member_candidates/?search=candi'
        )
        self.assertEqual(resp.status_code, 403)


class MembershipMutationTests(APITestCase):
    def setUp(self):
        self.superuser = User.objects.create_superuser(
            username='mut-su', password='testpass', email='musu@example.com'
        )
        self.staff = User.objects.create_user(
            username='mut-staff', password='testpass', is_staff=True
        )
        self.regular = User.objects.create_user(
            username='mut-regular', password='testpass'
        )
        self.group = Group.objects.create(name='Mut Group', code='MUT')
        self.target = User.objects.create_user(username='mut-target', password='p')

    def test_duplicate_membership_returns_400(self):
        UserGroup.objects.create(user=self.target, group=self.group)
        self.client.force_authenticate(self.superuser)
        resp = self.client.post(
            '/api/permissions/user-groups/',
            {'user': self.target.id, 'group': self.group.id},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_invalid_user_id_returns_400(self):
        self.client.force_authenticate(self.superuser)
        resp = self.client.post(
            '/api/permissions/user-groups/',
            {'user': 999999, 'group': self.group.id},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_invalid_group_id_returns_400(self):
        self.client.force_authenticate(self.superuser)
        resp = self.client.post(
            '/api/permissions/user-groups/',
            {'user': self.target.id, 'group': 999999},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_staff_cannot_create_membership(self):
        self.client.force_authenticate(self.staff)
        resp = self.client.post(
            '/api/permissions/user-groups/',
            {'user': self.target.id, 'group': self.group.id},
            format='json',
        )
        self.assertEqual(resp.status_code, 403)

    def test_regular_user_cannot_create_membership(self):
        self.client.force_authenticate(self.regular)
        resp = self.client.post(
            '/api/permissions/user-groups/',
            {'user': self.target.id, 'group': self.group.id},
            format='json',
        )
        self.assertEqual(resp.status_code, 403)

    def test_superuser_can_create_membership(self):
        self.client.force_authenticate(self.superuser)
        resp = self.client.post(
            '/api/permissions/user-groups/',
            {'user': self.target.id, 'group': self.group.id},
            format='json',
        )
        self.assertEqual(resp.status_code, 201)

    def test_superuser_can_remove_membership(self):
        ug = UserGroup.objects.create(user=self.target, group=self.group)
        self.client.force_authenticate(self.superuser)
        resp = self.client.delete(f'/api/permissions/user-groups/{ug.id}/')
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(UserGroup.objects.filter(pk=ug.id).exists())

    def test_staff_cannot_remove_membership(self):
        ug = UserGroup.objects.create(user=self.target, group=self.group)
        self.client.force_authenticate(self.staff)
        resp = self.client.delete(f'/api/permissions/user-groups/{ug.id}/')
        self.assertEqual(resp.status_code, 403)


class SiblingViewSetPaginationTests(APITestCase):
    """Regression guard: every permissions-app list viewset must honour
    ``?page_size=``. The global paginator has ``PAGE_SIZE=50`` and no
    ``page_size_query_param``, so any viewset that omits ``pagination_class``
    silently ignores the client override — the same bug class as B1.
    """

    def setUp(self):
        self.staff = User.objects.create_user(
            username='sib-staff', password='p', is_staff=True,
        )

    def test_roles_honours_page_size_param(self):
        from apps.permissions.models import Role
        for i in range(60):
            Role.objects.create(name=f'Role {i:02d}', code=f'R{i:02d}')
        self.client.force_authenticate(self.staff)
        resp = self.client.get('/api/permissions/roles/?page=1&page_size=25')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['results']), 25)

    def test_permissions_honours_page_size_param(self):
        from apps.permissions.models import Permission
        for i in range(60):
            Permission.objects.create(
                module=f'mod{i:02d}', action=f'act{i:02d}',
            )
        self.client.force_authenticate(self.staff)
        resp = self.client.get('/api/permissions/permissions/?page=1&page_size=25')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['results']), 25)
