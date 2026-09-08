"""Tests for superuser-only group/plugin permission mutation and group-based
plugin access enforcement.

Covers the dynamic group-based plugin access feature:
- Group and user-group mutation is superuser-only (staff denied).
- Plugin permission mutation (allowed_groups, allowed_role_codes, is_public)
  is superuser-only (staff denied).
- allowed_groups payload validation rejects malformed/nonexistent IDs.
- Group grant persists on the requested action only.
- Group member receives effective view permission; non-member does not.
- Group member without view does not receive active plugin metadata.
- Existing role/public/staff/superuser behavior remains unchanged.
"""
from unittest.mock import Mock, patch

from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.permissions.models import Group, Role, UserGroup
from apps.plugins.models import Plugin, PluginPermission


class GroupMutationPermissionsTests(APITestCase):
    """Group and user-group CRUD must be superuser-only."""

    def setUp(self):
        self.superuser = User.objects.create_superuser(
            username='group-superuser', password='testpass', email='su@example.com'
        )
        self.staff = User.objects.create_user(
            username='group-staff', password='testpass', is_staff=True
        )
        self.regular = User.objects.create_user(
            username='group-regular', password='testpass'
        )

    def test_staff_cannot_create_group(self):
        self.client.force_authenticate(self.staff)
        resp = self.client.post('/api/permissions/groups/', {
            'name': 'Staff Group', 'code': 'STAFF_GRP'
        })
        self.assertEqual(resp.status_code, 403)

    def test_superuser_can_create_group(self):
        self.client.force_authenticate(self.superuser)
        resp = self.client.post('/api/permissions/groups/', {
            'name': 'SU Group', 'code': 'SU_GRP'
        })
        self.assertEqual(resp.status_code, 201)

    def test_regular_user_cannot_create_group(self):
        self.client.force_authenticate(self.regular)
        resp = self.client.post('/api/permissions/groups/', {
            'name': 'Regular Group', 'code': 'REG_GRP'
        })
        self.assertEqual(resp.status_code, 403)

    def test_staff_cannot_assign_user_to_group(self):
        group = Group.objects.create(name='Test Group', code='TEST_GRP')
        target = User.objects.create_user(username='target-user', password='testpass')
        self.client.force_authenticate(self.staff)
        resp = self.client.post('/api/permissions/user-groups/', {
            'user': target.id, 'group': group.id
        })
        self.assertEqual(resp.status_code, 403)

    def test_superuser_can_assign_user_to_group(self):
        group = Group.objects.create(name='Test Group 2', code='TEST_GRP2')
        target = User.objects.create_user(username='target-user-2', password='testpass')
        self.client.force_authenticate(self.superuser)
        resp = self.client.post('/api/permissions/user-groups/', {
            'user': target.id, 'group': group.id
        })
        self.assertEqual(resp.status_code, 201)

    def test_staff_cannot_update_or_delete_group(self):
        group = Group.objects.create(name='Mutable Group', code='MUT_GRP')
        self.client.force_authenticate(self.staff)
        update = self.client.patch(
            f'/api/permissions/groups/{group.id}/', {'name': 'Changed'}
        )
        delete = self.client.delete(f'/api/permissions/groups/{group.id}/')
        self.assertEqual(update.status_code, 403)
        self.assertEqual(delete.status_code, 403)
        self.assertTrue(Group.objects.filter(pk=group.id).exists())

    def test_staff_can_list_and_retrieve_groups(self):
        group = Group.objects.create(name='Readable Group', code='READ_GRP')
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get('/api/permissions/groups/').status_code, 200)
        self.assertEqual(
            self.client.get(f'/api/permissions/groups/{group.id}/').status_code, 200
        )


class PluginPermissionMutationPermissionsTests(APITestCase):
    """Plugin permission mutation must be superuser-only."""

    def setUp(self):
        self.superuser = User.objects.create_superuser(
            username='plugin-superuser', password='testpass', email='psu@example.com'
        )
        self.staff = User.objects.create_user(
            username='plugin-staff', password='testpass', is_staff=True
        )
        self.plugin = Plugin.objects.create(
            name='test_plugin_groups', verbose_name='Test Plugin Groups', version='1.0.0'
        )
        PluginPermission.objects.create(plugin_name='test_plugin_groups', action='view')

    def test_staff_cannot_mutate_plugin_permissions(self):
        self.client.force_authenticate(self.staff)
        resp = self.client.post(
            f'/api/plugins/management/{self.plugin.id}/permissions/',
            {'action': 'view', 'is_public': True},
            format='json'
        )
        self.assertEqual(resp.status_code, 403)

    def test_superuser_can_mutate_plugin_permissions(self):
        self.client.force_authenticate(self.superuser)
        resp = self.client.post(
            f'/api/plugins/management/{self.plugin.id}/permissions/',
            {'action': 'view', 'is_public': True},
            format='json'
        )
        self.assertEqual(resp.status_code, 200)

    def test_staff_cannot_assign_allowed_groups(self):
        group = Group.objects.create(name='Plugin Group', code='PLG_GRP')
        self.client.force_authenticate(self.staff)
        resp = self.client.post(
            f'/api/plugins/management/{self.plugin.id}/permissions/',
            {'action': 'view', 'allowed_groups': [group.id]},
            format='json'
        )
        self.assertEqual(resp.status_code, 403)


class PluginPermissionGroupValidationTests(APITestCase):
    """allowed_groups payload validation."""

    def setUp(self):
        self.superuser = User.objects.create_superuser(
            username='validation-su', password='testpass', email='vsu@example.com'
        )
        self.plugin = Plugin.objects.create(
            name='validation_plugin', verbose_name='Validation Plugin', version='1.0.0'
        )
        PluginPermission.objects.create(plugin_name='validation_plugin', action='view')

    def test_nonexistent_group_id_rejected(self):
        self.client.force_authenticate(self.superuser)
        resp = self.client.post(
            f'/api/plugins/management/{self.plugin.id}/permissions/',
            {'action': 'view', 'allowed_groups': [99999]},
            format='json'
        )
        self.assertEqual(resp.status_code, 400)

    def test_non_list_allowed_groups_rejected(self):
        self.client.force_authenticate(self.superuser)
        resp = self.client.post(
            f'/api/plugins/management/{self.plugin.id}/permissions/',
            {'action': 'view', 'allowed_groups': 'not-a-list'},
            format='json'
        )
        self.assertEqual(resp.status_code, 400)

    def test_boolean_group_id_rejected_without_creating_permission(self):
        self.client.force_authenticate(self.superuser)
        resp = self.client.post(
            f'/api/plugins/management/{self.plugin.id}/permissions/',
            {'action': 'manage', 'allowed_groups': [True]},
            format='json'
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(
            PluginPermission.objects.filter(
                plugin_name='validation_plugin', action='manage'
            ).exists()
        )

    def test_invalid_group_payload_does_not_partially_update_roles(self):
        role = Role.objects.create(name='Atomic Role', code='atomic_role')
        self.client.force_authenticate(self.superuser)
        resp = self.client.post(
            f'/api/plugins/management/{self.plugin.id}/permissions/',
            {
                'action': 'view',
                'allowed_role_codes': [role.code],
                'allowed_groups': [99999],
            },
            format='json'
        )
        self.assertEqual(resp.status_code, 400)
        perm = PluginPermission.objects.get(
            plugin_name='validation_plugin', action='view'
        )
        self.assertNotIn(role, perm.allowed_roles.all())

    def test_valid_group_assignment_persists(self):
        group = Group.objects.create(name='Valid Group', code='VAL_GRP')
        self.client.force_authenticate(self.superuser)
        resp = self.client.post(
            f'/api/plugins/management/{self.plugin.id}/permissions/',
            {'action': 'view', 'allowed_groups': [group.id]},
            format='json'
        )
        self.assertEqual(resp.status_code, 200)
        perm = PluginPermission.objects.get(
            plugin_name='validation_plugin', action='view'
        )
        self.assertIn(group, perm.allowed_groups.all())

    def test_group_assignment_does_not_overwrite_roles(self):
        group = Group.objects.create(name='Role Preserve Group', code='RP_GRP')
        role = Role.objects.create(name='Preserve Role', code='preserve_role')
        perm = PluginPermission.objects.get(
            plugin_name='validation_plugin', action='view'
        )
        perm.allowed_roles.add(role)
        self.client.force_authenticate(self.superuser)
        resp = self.client.post(
            f'/api/plugins/management/{self.plugin.id}/permissions/',
            {'action': 'view', 'allowed_groups': [group.id]},
            format='json'
        )
        self.assertEqual(resp.status_code, 200)
        perm.refresh_from_db()
        self.assertIn(role, perm.allowed_roles.all())
        self.assertIn(group, perm.allowed_groups.all())

    def test_group_assignment_targets_only_requested_action(self):
        group = Group.objects.create(name='Action Specific Group', code='AS_GRP')
        PluginPermission.objects.create(
            plugin_name='validation_plugin', action='manage'
        )
        self.client.force_authenticate(self.superuser)
        resp = self.client.post(
            f'/api/plugins/management/{self.plugin.id}/permissions/',
            {'action': 'view', 'allowed_groups': [group.id]},
            format='json'
        )
        self.assertEqual(resp.status_code, 200)
        view_perm = PluginPermission.objects.get(
            plugin_name='validation_plugin', action='view'
        )
        manage_perm = PluginPermission.objects.get(
            plugin_name='validation_plugin', action='manage'
        )
        self.assertIn(group, view_perm.allowed_groups.all())
        self.assertNotIn(group, manage_perm.allowed_groups.all())


class GroupBasedPluginAccessTests(APITestCase):
    """Group membership grants effective plugin access."""

    def setUp(self):
        self.superuser = User.objects.create_superuser(
            username='access-su', password='testpass', email='asu@example.com'
        )
        self.group = Group.objects.create(name='Access Group', code='ACC_GRP')
        self.member = User.objects.create_user(
            username='group-member', password='testpass'
        )
        self.non_member = User.objects.create_user(
            username='non-member', password='testpass'
        )
        UserGroup.objects.create(user=self.member, group=self.group)
        self.plugin = Plugin.objects.create(
            name='access_plugin', verbose_name='Access Plugin', version='1.0.0',
            is_enabled=True,
        )
        self.view_perm = PluginPermission.objects.create(
            plugin_name='access_plugin', action='view'
        )

    def test_group_member_has_view_access(self):
        self.view_perm.allowed_groups.add(self.group)
        self.assertTrue(self.view_perm.has_access(self.member))

    def test_non_member_does_not_have_view_access(self):
        self.view_perm.allowed_groups.add(self.group)
        self.assertFalse(self.view_perm.has_access(self.non_member))

    def test_empty_group_list_does_not_grant_access(self):
        self.assertFalse(self.view_perm.has_access(self.member))

    def test_group_view_does_not_grant_manage(self):
        self.view_perm.allowed_groups.add(self.group)
        manage_perm = PluginPermission.objects.create(
            plugin_name='access_plugin', action='manage'
        )
        self.assertFalse(manage_perm.has_access(self.member))

    def test_group_member_gets_effective_permissions(self):
        self.view_perm.allowed_groups.add(self.group)
        perms = PluginPermission.get_user_permissions(self.member, 'access_plugin')
        self.assertIn('view', perms.get('access_plugin', []))

    def test_non_member_does_not_get_effective_permissions(self):
        self.view_perm.allowed_groups.add(self.group)
        perms = PluginPermission.get_user_permissions(self.non_member, 'access_plugin')
        self.assertNotIn('view', perms.get('access_plugin', []))

    def test_superuser_bypasses_group_check(self):
        perms = PluginPermission.get_user_permissions(self.superuser, 'access_plugin')
        self.assertIn('view', perms.get('access_plugin', []))

    def test_staff_bypasses_group_check(self):
        staff = User.objects.create_user(
            username='access-staff', password='testpass', is_staff=True
        )
        perms = PluginPermission.get_user_permissions(staff, 'access_plugin')
        self.assertIn('view', perms.get('access_plugin', []))

    @patch('apps.plugins.viewsets.plugin_registry.get_active_plugins')
    def test_group_member_receives_active_metadata(self, get_active_plugins):
        frontend_plugin = Mock()
        frontend_plugin.name = 'access_plugin'
        frontend_plugin.get_frontend_metadata.return_value = {'name': 'access_plugin'}
        get_active_plugins.return_value = {'access_plugin': frontend_plugin}
        self.view_perm.allowed_groups.add(self.group)
        self.client.force_authenticate(self.member)

        response = self.client.get('/api/plugins/management/active_metadata/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [{'name': 'access_plugin'}])

    @patch('apps.plugins.viewsets.plugin_registry.get_active_plugins')
    def test_non_member_does_not_receive_active_metadata(self, get_active_plugins):
        frontend_plugin = Mock()
        frontend_plugin.name = 'access_plugin'
        frontend_plugin.get_frontend_metadata.return_value = {'name': 'access_plugin'}
        get_active_plugins.return_value = {'access_plugin': frontend_plugin}
        self.view_perm.allowed_groups.add(self.group)
        self.client.force_authenticate(self.non_member)

        response = self.client.get('/api/plugins/management/active_metadata/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])

    def test_public_access_overrides_group_membership(self):
        self.view_perm.is_public = True
        self.view_perm.save(update_fields=['is_public'])
        self.assertTrue(self.view_perm.has_access(self.non_member))
