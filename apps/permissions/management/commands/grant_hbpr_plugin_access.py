"""Give the hbpr role plugin `view` on the plugins it was designed for.

Manifest sync only creates missing PluginPermission rows, so a database that
predates the hbpr role never picks the grant up on its own. This runs on every
container start (see docker/entrypoint.sh), so it adds the role only while hbpr
has no plugin grants at all; once an admin has configured it, it is left alone.
"""
from django.core.management.base import BaseCommand

from apps.permissions.models import Role
from apps.plugins.models import PluginPermission

PLUGINS = ('tl_scorecard', 'engagement')


class Command(BaseCommand):
    help = 'Grant the hbpr role view access to its default plugins (first run only).'

    def handle(self, *args, **options):
        role = Role.objects.filter(code='hbpr').first()
        if role is None or role.plugin_permissions.exists():
            return
        rows = PluginPermission.objects.filter(plugin_name__in=PLUGINS, action='view')
        for row in rows:
            row.allowed_roles.add(role)
        self.stdout.write(f'hbpr granted view on {rows.count()} plugin(s).')
