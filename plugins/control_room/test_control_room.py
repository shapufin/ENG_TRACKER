"""
Phase 1 tests for the Control Room plugin shell.

Covers:
- Plugin metadata (name, version, verbose_name, description).
- Config schema + validation.
- Model creation, uniqueness, and cascade behavior.
- Empty scope is NOT global scope (enforced at the service layer in
  Phase 2; here we only assert the data shape).
"""
from django.test import TestCase
from django.contrib.auth.models import User

from apps.users.models.core import Team
from plugins.control_room.models import ControlRoomAccess, ControlRoomTeamScope
from plugins.control_room.plugin import ControlRoomPlugin


class ControlRoomPluginMetadataTests(TestCase):
    def setUp(self):
        self.plugin = ControlRoomPlugin()

    def test_plugin_name(self):
        self.assertEqual(self.plugin.name, 'control_room')

    def test_plugin_version(self):
        self.assertEqual(self.plugin.version, '1.0.0')

    def test_plugin_verbose_name(self):
        self.assertEqual(self.plugin.verbose_name, 'Control Room')

    def test_plugin_description_mentions_standby(self):
        self.assertIn('standby', self.plugin.description.lower())

    def test_plugin_routes_include_dashboard_and_access(self):
        routes = self.plugin.get_frontend_metadata()['routes']
        paths = [r['path'] for r in routes]
        self.assertIn('/control-room/dashboard', paths)
        self.assertIn('/admin/control-room/access', paths)

    def test_config_schema_has_status_mode(self):
        schema = self.plugin.get_config_schema()
        self.assertIn('default_status_mode', schema)
        self.assertIn('include_rejected', schema)

    def test_validate_config_accepts_valid_mode(self):
        self.assertTrue(self.plugin.validate_config({'default_status_mode': 'approved_only'}))

    def test_validate_config_rejects_invalid_mode(self):
        with self.assertRaises(ValueError):
            self.plugin.validate_config({'default_status_mode': 'bogus'})

    def test_validate_config_rejects_non_boolean_include_rejected(self):
        with self.assertRaises(ValueError):
            self.plugin.validate_config({'include_rejected': 'yes'})


class ControlRoomAccessModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='crops', email='crops@example.com', password='testpass123'
        )
        self.admin = User.objects.create_user(
            username='admin1', email='admin1@example.com', password='testpass123',
            is_staff=True,
        )

    def test_access_creation(self):
        access = ControlRoomAccess.objects.create(user=self.user, created_by=self.admin)
        self.assertEqual(access.user, self.user)
        self.assertTrue(access.is_active)
        self.assertEqual(access.created_by, self.admin)

    def test_access_str_includes_username_and_state(self):
        access = ControlRoomAccess.objects.create(user=self.user)
        self.assertIn('crops', str(access))
        self.assertIn('active', str(access))

    def test_access_str_shows_inactive(self):
        access = ControlRoomAccess.objects.create(user=self.user, is_active=False)
        self.assertIn('inactive', str(access))

    def test_access_user_unique(self):
        ControlRoomAccess.objects.create(user=self.user)
        with self.assertRaises(Exception):
            ControlRoomAccess.objects.create(user=self.user)

    def test_deleting_user_deletes_access(self):
        access = ControlRoomAccess.objects.create(user=self.user)
        self.user.delete()
        self.assertFalse(ControlRoomAccess.objects.filter(id=access.id).exists())


class ControlRoomTeamScopeModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='crops', password='testpass123')
        self.access = ControlRoomAccess.objects.create(user=self.user)
        self.team = Team.objects.create(name='Platform', code='PLAT')

    def test_scope_creation(self):
        scope = ControlRoomTeamScope.objects.create(access=self.access, team=self.team)
        self.assertEqual(scope.access, self.access)
        self.assertEqual(scope.team, self.team)
        self.assertFalse(scope.include_subteams)

    def test_scope_str(self):
        scope = ControlRoomTeamScope.objects.create(access=self.access, team=self.team)
        self.assertIn('crops', str(scope))
        self.assertIn('Platform', str(scope))

    def test_scope_unique_per_access_team(self):
        ControlRoomTeamScope.objects.create(access=self.access, team=self.team)
        with self.assertRaises(Exception):
            ControlRoomTeamScope.objects.create(access=self.access, team=self.team)

    def test_deleting_access_cascades_to_scopes(self):
        scope = ControlRoomTeamScope.objects.create(access=self.access, team=self.team)
        self.access.delete()
        self.assertFalse(ControlRoomTeamScope.objects.filter(id=scope.id).exists())

    def test_deleting_team_cascades_to_scopes(self):
        scope = ControlRoomTeamScope.objects.create(access=self.access, team=self.team)
        self.team.delete()
        self.assertFalse(ControlRoomTeamScope.objects.filter(id=scope.id).exists())

    def test_empty_scope_does_not_create_team_membership(self):
        """Sanity: an access record with no scopes has zero scopes."""
        self.assertEqual(self.access.team_scopes.count(), 0)
