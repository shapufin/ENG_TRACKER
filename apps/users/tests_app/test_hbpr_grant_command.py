from django.core.management import call_command
from django.test import TestCase

from apps.permissions.models import Role
from apps.plugins.models import PluginPermission


class GrantHbprPluginAccessTests(TestCase):
    def setUp(self):
        self.role, _ = Role.objects.get_or_create(code='hbpr', defaults={'name': 'HBPR'})
        self.rows = {
            n: PluginPermission.objects.create(plugin_name=n, action='view')
            for n in ('tl_scorecard', 'engagement', 'payroll')
        }

    def _holders(self, name):
        return set(self.rows[name].allowed_roles.values_list('code', flat=True))

    def test_grants_only_the_designated_plugins(self):
        call_command('grant_hbpr_plugin_access')
        self.assertIn('hbpr', self._holders('tl_scorecard'))
        self.assertIn('hbpr', self._holders('engagement'))
        self.assertNotIn('hbpr', self._holders('payroll'))

    def test_does_not_undo_an_admin_removal(self):
        call_command('grant_hbpr_plugin_access')
        self.rows['engagement'].allowed_roles.remove(self.role)
        call_command('grant_hbpr_plugin_access')
        self.assertNotIn('hbpr', self._holders('engagement'))

    def test_noop_when_role_missing(self):
        self.role.delete()
        call_command('grant_hbpr_plugin_access')
