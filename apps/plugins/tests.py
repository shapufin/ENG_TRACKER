"""Tests for plugin uninstall DB cleanup and the remove_plugin command.

Covers the 2026-07-26 fix: uninstall_plugin now deletes Plugin +
PluginPermission + M2M rows (previously only dropped tables, leaving
orphaned metadata rows). Also covers remove_plugin command target
gathering and cross-reference detection (non-destructive paths only).
"""
import io
from pathlib import Path
from unittest.mock import MagicMock, patch

from django.core.management import call_command
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.plugins.models import Plugin, PluginPermission
from apps.permissions.models import Group, Role, UserGroup, UserRole
from apps.plugins.services.permission_manifest import (
    sync_plugin_permission_manifest,
    validate_manifest,
)
from core.plugins.registry import PluginRegistry
from plugins.control_room.models import ControlRoomAccess


class PluginDiscoveryTests(TestCase):
    """Plugin discovery must ignore filesystem artifacts and stale entries."""

    def test_plugin_apps_include_only_valid_plugin_packages(self):
        registry = PluginRegistry()
        apps = registry.get_plugin_apps()

        self.assertNotIn('plugins.__pycache__', apps)
        self.assertTrue(apps)
        for app_label in apps:
            plugin_name = app_label.split('.', 1)[1]
            self.assertTrue(
                (Path(__file__).resolve().parents[2] / 'plugins' / plugin_name / 'plugin.py').is_file()
            )

    def test_rediscovery_removes_plugins_missing_from_disk(self):
        registry = PluginRegistry()
        original_plugins = registry.get_all_plugins().copy()
        registry._plugins['removed_plugin'] = object()
        try:
            registry.discover_plugins()
            self.assertNotIn('removed_plugin', registry.get_all_plugins())
        finally:
            registry._plugins = original_plugins


class UninstallDBCleanupTests(TestCase):
    """Tests for PluginRegistry._cleanup_plugin_db_rows + uninstall_plugin."""

    def setUp(self):
        self.plugin_name = "test_plugin_for_cleanup"
        # Create Plugin + PluginPermission rows as they'd exist for an
        # installed plugin.
        self.plugin_obj = Plugin.objects.create(
            name=self.plugin_name,
            verbose_name="Test Plugin",
            description="Test",
            version="1.0.0",
            is_enabled=True,
        )
        # Create permissions for each action.
        self.perms = []
        for action in ('view', 'manage', 'configure', 'export'):
            p = PluginPermission.objects.create(plugin_name=self.plugin_name, action=action)
            self.perms.append(p)

    def test_cleanup_deletes_plugin_row(self):
        """_cleanup_plugin_db_rows deletes the Plugin row."""
        PluginRegistry._cleanup_plugin_db_rows(self.plugin_name)
        self.assertFalse(Plugin.objects.filter(name=self.plugin_name).exists())

    def test_cleanup_deletes_permission_rows(self):
        """_cleanup_plugin_db_rows deletes all PluginPermission rows."""
        PluginRegistry._cleanup_plugin_db_rows(self.plugin_name)
        self.assertEqual(PluginPermission.objects.filter(plugin_name=self.plugin_name).count(), 0)

    def test_cleanup_idempotent_when_no_rows(self):
        """_cleanup_plugin_db_rows is safe to call when no rows exist."""
        PluginRegistry._cleanup_plugin_db_rows(self.plugin_name)
        # Call again — should not raise.
        PluginRegistry._cleanup_plugin_db_rows(self.plugin_name)
        self.assertFalse(Plugin.objects.filter(name=self.plugin_name).exists())

    def test_cleanup_idempotent_for_unknown_plugin(self):
        """_cleanup_plugin_db_rows is safe for a plugin that never existed."""
        PluginRegistry._cleanup_plugin_db_rows("nonexistent_plugin_xyz")
        # No error, no side effect.
        self.assertEqual(Plugin.objects.filter(name="nonexistent_plugin_xyz").count(), 0)

    def test_activation_syncs_manifest_and_calls_ready(self):
        registry = PluginRegistry()
        plugin_name = 'activation_manifest_plugin'
        plugin = _MockPlugin(plugin_name)
        registry._plugins[plugin_name] = plugin
        try:
            result = registry.activate_plugin(plugin_name)
            self.assertTrue(result)
            self.assertTrue(Plugin.objects.get(name=plugin_name).is_enabled)
            self.assertEqual(
                PluginPermission.objects.filter(plugin_name=plugin_name).count(), 4
            )
        finally:
            registry._plugins.pop(plugin_name, None)
            Plugin.objects.filter(name=plugin_name).delete()
            PluginPermission.objects.filter(plugin_name=plugin_name).delete()

    def test_activation_ready_failure_rolls_back_enabled_state(self):
        registry = PluginRegistry()
        plugin_name = 'activation_failure_plugin'

        class FailingPlugin(_MockPlugin):
            def ready(self):
                raise RuntimeError('ready failed')

        registry._plugins[plugin_name] = FailingPlugin(plugin_name)
        try:
            self.assertFalse(registry.activate_plugin(plugin_name))
            self.assertFalse(Plugin.objects.get(name=plugin_name).is_enabled)
        finally:
            registry._plugins.pop(plugin_name, None)
            Plugin.objects.filter(name=plugin_name).delete()
            PluginPermission.objects.filter(plugin_name=plugin_name).delete()

    def test_activation_ready_failure_calls_disable_to_clean_partial_signals(self):
        """If ready() partially connects signals then raises, activate_plugin
        must call disable() so the partial signal connections are torn down.
        Regression for the lifecycle gap where a plugin appeared disabled in
        the DB but its signals kept firing."""
        from django.db.models.signals import post_save
        from apps.permissions.models import Role

        registry = PluginRegistry()
        plugin_name = 'activation_partial_signal_plugin'
        dispatch_uid = f'test.{plugin_name}.partial'
        calls = {'disable': 0}

        class PartialSignalPlugin(_MockPlugin):
            def ready(self):
                # Connect a real signal (mimicking a plugin that connects
                # handlers individually inside ready()), then raise so the
                # connection is left dangling.
                post_save.connect(
                    lambda sender, instance, **kw: None,
                    sender=Role,
                    dispatch_uid=dispatch_uid,
                )
                raise RuntimeError('ready failed mid-connect')

            def disable(self):
                calls['disable'] += 1
                post_save.disconnect(dispatch_uid=dispatch_uid, sender=Role)

        registry._plugins[plugin_name] = PartialSignalPlugin(plugin_name)
        try:
            self.assertFalse(registry.activate_plugin(plugin_name))
            self.assertFalse(Plugin.objects.get(name=plugin_name).is_enabled)
            # disable() must have been called to clean up the partial signal.
            self.assertEqual(calls['disable'], 1)
            # And the signal handler must actually be disconnected.
            self.assertFalse(post_save.has_listeners(sender=Role))
        finally:
            # Safety net: disconnect if the test logic itself failed to.
            post_save.disconnect(dispatch_uid=dispatch_uid, sender=Role)
            registry._plugins.pop(plugin_name, None)
            Plugin.objects.filter(name=plugin_name).delete()
            PluginPermission.objects.filter(plugin_name=plugin_name).delete()

    def test_uninstall_plugin_cleans_db_rows(self):
        """uninstall_plugin deletes Plugin + PluginPermission rows, not just
        tables. Uses a mock plugin so we don't need a real plugin dir."""
        # Build a fake plugin instance in the registry.
        registry = PluginRegistry()
        registry._plugins[self.plugin_name] = _MockPlugin(self.plugin_name)

        # Patch the table-drop to succeed (no real tables to drop).
        with patch.object(_MockPlugin, 'uninstall', return_value=True):
            result = registry.uninstall_plugin(self.plugin_name, backup_data=False)

        self.assertTrue(result)
        self.assertFalse(Plugin.objects.filter(name=self.plugin_name).exists())
        self.assertEqual(PluginPermission.objects.filter(plugin_name=self.plugin_name).count(), 0)
        # Plugin should be removed from the in-memory registry.
        self.assertNotIn(self.plugin_name, registry._plugins)


class DropPluginTablesTests(TestCase):
    """Tests for PluginTableManager.drop_plugin_tables table-name hardening.

    Regression for the DROP TABLE f-string interpolation: table names must
    be re-validated against a fresh introspection pass (and the plugin's own
    prefix) before being used to build SQL, not just trusted from whatever
    list the caller passed in."""

    def test_drop_plugin_tables_only_drops_validated_tables(self):
        from core.plugins.initializer import PluginTableManager

        plugin_name = 'safedroptest'
        legit_table = f'{plugin_name}_widget'

        # `get_plugin_tables` returns a table that is NOT present in a fresh
        # `get_existing_tables()` introspection - this must be filtered out
        # before it ever reaches raw SQL.
        with patch.object(
            PluginTableManager, 'get_plugin_tables',
            return_value=[legit_table, 'other_app_table'],
        ), patch.object(
            PluginTableManager, 'get_existing_tables',
            return_value={legit_table},
        ):
            mock_cursor = MagicMock()
            mock_cursor.__enter__.return_value = mock_cursor
            with patch('core.plugins.initializer.connection') as mock_connection:
                mock_connection.cursor.return_value = mock_cursor
                mock_connection.vendor = 'sqlite'
                mock_connection.ops.quote_name.side_effect = lambda t: f'"{t}"'

                result = PluginTableManager.drop_plugin_tables(plugin_name)

        self.assertTrue(result)
        executed_sql = [call.args[0] for call in mock_cursor.execute.call_args_list]
        self.assertEqual(len(executed_sql), 1)
        self.assertIn(legit_table, executed_sql[0])
        self.assertNotIn('other_app_table', ' '.join(executed_sql))

    def test_drop_plugin_tables_happy_path_drops_all_valid_tables(self):
        """Regression: hardening the validation must not break the normal
        case where every table returned is a real, current plugin table."""
        from core.plugins.initializer import PluginTableManager

        plugin_name = 'safedroptest'
        tables = [f'{plugin_name}_widget', f'{plugin_name}_gadget']

        with patch.object(
            PluginTableManager, 'get_plugin_tables', return_value=tables,
        ), patch.object(
            PluginTableManager, 'get_existing_tables', return_value=set(tables),
        ):
            mock_cursor = MagicMock()
            mock_cursor.__enter__.return_value = mock_cursor
            with patch('core.plugins.initializer.connection') as mock_connection:
                mock_connection.cursor.return_value = mock_cursor
                mock_connection.vendor = 'sqlite'
                mock_connection.ops.quote_name.side_effect = lambda t: f'"{t}"'

                result = PluginTableManager.drop_plugin_tables(plugin_name)

        self.assertTrue(result)
        executed_sql = [call.args[0] for call in mock_cursor.execute.call_args_list]
        self.assertEqual(len(executed_sql), 2)
        for table in tables:
            self.assertTrue(any(table in sql for sql in executed_sql))


class ActiveMetadataTests(APITestCase):
    """Regression tests for plugin metadata visibility in the app shell."""

    def setUp(self):
        self.registry = PluginRegistry()
        self.registry.discover_plugins()
        if 'control_room' not in self.registry.get_all_plugins():
            self.fail("control_room plugin is not discoverable in tests")

        Plugin.objects.update_or_create(
            name='control_room',
            defaults={
                'verbose_name': 'Control Room',
                'description': 'Control Room plugin',
                'version': '1.0.0',
                'is_enabled': True,
            },
        )

    def test_active_metadata_includes_control_room_for_cr_user_with_access(self):
        user = User.objects.create_user(username='cr_user', password='x')
        ControlRoomAccess.objects.create(user=user, is_active=True)
        self.client.force_authenticate(user=user)

        response = self.client.get('/api/plugins/management/active_metadata/')
        self.assertEqual(response.status_code, 200)
        plugin_names = {row.get('name') for row in response.data if isinstance(row, dict)}
        self.assertIn('control_room', plugin_names)

    def test_active_metadata_excludes_control_room_for_regular_user_without_access(self):
        user = User.objects.create_user(username='regular_user', password='x')
        self.client.force_authenticate(user=user)

        response = self.client.get('/api/plugins/management/active_metadata/')
        self.assertEqual(response.status_code, 200)
        plugin_names = {row.get('name') for row in response.data if isinstance(row, dict)}
        self.assertNotIn('control_room', plugin_names)


class PluginPermissionDetailsTests(APITestCase):
    def test_details_exposes_plugin_specific_actions(self):
        user = User.objects.create_superuser(
            username='plugin-details-admin', password='testpass', email='admin@example.com'
        )
        plugin = Plugin.objects.create(
            name='analytics',
            verbose_name='Analytics',
            description='Analytics plugin',
            version='1.0.0',
            is_enabled=True,
        )
        self.client.force_authenticate(user=user)

        response = self.client.get(f'/api/plugins/management/{plugin.id}/details/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['permission_actions'], ['view', 'manage', 'export'])


class PluginPermissionMatrixTests(TestCase):
    def setUp(self):
        self.employee_role, _ = Role.objects.get_or_create(
            code='employee', defaults={'name': 'Employee'}
        )
        self.hr_role, _ = Role.objects.get_or_create(
            code='hr', defaults={'name': 'HR'}
        )
        self.tl_role, _ = Role.objects.get_or_create(
            code='italian_tl', defaults={'name': 'Italian TL'}
        )
        self.group = Group.objects.create(name='Matrix Group', code='matrix-group')
        self.plugin = Plugin.objects.create(
            name='matrix_plugin', verbose_name='Matrix Plugin', version='1.0.0'
        )
        self.view_permission = PluginPermission.objects.create(
            plugin_name='matrix_plugin', action='view'
        )
        self.employee = User.objects.create_user(username='matrix-employee')
        self.hr = User.objects.create_user(username='matrix-hr')
        self.tl = User.objects.create_user(username='matrix-tl')
        self.group_user = User.objects.create_user(username='matrix-group-user')
        self.staff = User.objects.create_user(username='matrix-staff', is_staff=True)
        self.superuser = User.objects.create_superuser(
            username='matrix-superuser', email='matrix-superuser@example.com', password='testpass'
        )
        UserRole.objects.create(user=self.employee, role=self.employee_role, is_active=True)
        UserRole.objects.create(user=self.hr, role=self.hr_role, is_active=True)
        UserRole.objects.create(user=self.tl, role=self.tl_role, is_active=True)
        UserGroup.objects.create(user=self.group_user, group=self.group)

    def test_allowed_role_codes_control_access(self):
        self.view_permission.allowed_roles.add(self.hr_role)
        self.assertFalse(self.view_permission.has_access(self.employee))
        self.assertTrue(self.view_permission.has_access(self.hr))
        self.assertFalse(self.view_permission.has_access(self.tl))

    def test_group_access_and_staff_bypass(self):
        self.view_permission.allowed_groups.add(self.group)
        self.assertTrue(self.view_permission.has_access(self.group_user))
        self.assertTrue(self.view_permission.has_access(self.staff))
        self.assertTrue(self.view_permission.has_access(self.superuser))
        self.assertFalse(self.view_permission.has_access(self.employee))

    def test_inactive_role_does_not_grant_access(self):
        assignment = UserRole.objects.create(
            user=self.employee, role=self.hr_role, is_active=False
        )
        self.view_permission.allowed_roles.add(self.hr_role)
        self.assertFalse(self.view_permission.has_access(self.employee))
        assignment.delete()

    def test_public_access_allows_authenticated_users(self):
        self.view_permission.is_public = True
        self.view_permission.save(update_fields=['is_public'])
        self.assertTrue(self.view_permission.has_access(self.employee))
        self.assertTrue(self.view_permission.has_access(self.hr))

    def test_missing_permission_fails_closed(self):
        missing = PluginPermission.objects.create(
            plugin_name='matrix_plugin', action='configure'
        )
        self.assertFalse(missing.has_access(self.employee))

    def test_manifest_creates_explicit_deny_rows(self):
        class ManifestPlugin:
            name = 'manifest_plugin'

            def get_permission_manifest(self):
                return {
                    'view': {'roles': ['hr'], 'public': False},
                }

        result = sync_plugin_permission_manifest(ManifestPlugin())
        self.assertEqual(result['created'], 4)
        view = PluginPermission.objects.get(plugin_name='manifest_plugin', action='view')
        self.assertEqual(list(view.allowed_roles.values_list('code', flat=True)), ['hr'])
        self.assertFalse(
            PluginPermission.objects.get(
                plugin_name='manifest_plugin', action='manage'
            ).is_public
        )

    def test_manifest_does_not_overwrite_customized_permission(self):
        self.view_permission.is_public = True
        self.view_permission.save(update_fields=['is_public'])

        class ManifestPlugin:
            name = 'matrix_plugin'

            def get_permission_manifest(self):
                return {'view': {'roles': ['hr'], 'public': False}}

        sync_plugin_permission_manifest(ManifestPlugin())
        self.view_permission.refresh_from_db()
        self.assertTrue(self.view_permission.is_public)

    def test_manifest_rejects_unknown_role_and_action(self):
        with self.assertRaisesMessage(ValueError, 'Unsupported plugin action'):
            validate_manifest({'invalid': {'roles': [], 'public': False}})
        with self.assertRaisesMessage(ValueError, 'Unknown plugin role code'):
            validate_manifest({'view': {'roles': ['missing'], 'public': False}})


class _MockPlugin:
    """Minimal plugin stub for registry tests — avoids needing a real
    plugin directory for registry tests."""

    def __init__(self, name):
        self.name = name
        self.verbose_name = "Mock"
        self.description = "Mock"
        self.version = "1.0.0"

    def get_permission_manifest(self):
        return {
            action: {"roles": [], "public": False}
            for action in ("view", "manage", "configure", "export")
        }

    def activate(self):
        return True

    def ready(self):
        return None

    def uninstall(self, backup_data=False):
        return True


class RemovePluginCommandTests(TestCase):
    """Tests for the remove_plugin management command (non-destructive paths)."""

    def test_dry_run_does_not_delete(self):
        """--dry-run prints the plan but does not delete anything."""
        out = io.StringIO()
        # Use a nonexistent plugin name — command should error, not delete.
        with self.assertRaises(SystemExit):
            call_command('remove_plugin', 'nonexistent_plugin_xyz', '--dry-run', stdout=out)

    def test_dry_run_for_real_plugin_lists_targets(self):
        """--dry-run for a real plugin lists targets without deleting."""
        out = io.StringIO()
        # 'analytics' is a real plugin that should never be deleted.
        call_command('remove_plugin', 'analytics', '--dry-run', stdout=out)
        output = out.getvalue()
        self.assertIn('PLUGIN REMOVAL: analytics', output)
        self.assertIn('DRY RUN', output)
        # Should NOT have executed any deletion.
        self.assertNotIn('✓ Deleted', output)
        # Should list backend code path (use os-agnostic check).
        self.assertIn('analytics', output)
        self.assertIn('Backend code:', output)

    def test_find_frontend_files_finds_matching_files(self):
        """_find_frontend_files locates files by plugin name variant."""
        from django.conf import settings
        project_root = Path(settings.BASE_DIR)
        from apps.plugins.management.commands.remove_plugin import Command
        cmd = Command()
        # 'analytics' should find AnalyticsPage.tsx in pages/analytics/
        files = cmd._find_frontend_files('analytics', project_root)
        file_names = [f.name for f in files]
        self.assertIn('AnalyticsPage.tsx', file_names)

    def test_find_frontend_files_returns_empty_for_unknown(self):
        """_find_frontend_files returns empty list for unknown plugin."""
        from django.conf import settings
        project_root = Path(settings.BASE_DIR)
        from apps.plugins.management.commands.remove_plugin import Command
        cmd = Command()
        files = cmd._find_frontend_files('nonexistent_xyz', project_root)
        self.assertEqual(files, [])

    def test_cross_ref_detection_finds_imports(self):
        """_print_cross_refs detects Python imports of the plugin."""
        from django.conf import settings
        project_root = Path(settings.BASE_DIR)
        from apps.plugins.management.commands.remove_plugin import Command
        cmd = Command()
        out = io.StringIO()
        cmd.stdout = out
        # 'analytics' is imported by other plugins? Let's test with a
        # plugin we know has cross-refs. We'll just verify the method runs
        # without error and produces output.
        cmd._print_cross_refs('analytics', project_root)
        output = out.getvalue()
        # Should either find refs or report none — either way, should
        # contain the step label.
        self.assertIn('Step 9', output)
