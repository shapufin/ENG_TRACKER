"""Reconcile the hbpr role's plugin `view` grants with the intended state.

HBPR reads ``tl_scorecard`` only. The manifests declare that grant, but
``sync_plugin_permission_manifest`` never edits an *existing* row, so a database
that predates the hbpr role keeps its original (hbpr-less) rows. This runs on
every container start (see docker/entrypoint.sh) and idempotently asserts the
intended state:

- add ``hbpr`` to ``tl_scorecard`` view;
- remove ``hbpr`` from ``engagement`` view (the role is read-only over
  Albanian-TL governance and has no Engagement access).

It is a reconciler, not a one-shot: an admin who removes the tl_scorecard grant
will see it re-asserted on the next boot. That is deliberate — the grant is
manifest-owned, so the manifest is the source of truth for it.
"""
from django.core.management.base import BaseCommand

from apps.permissions.models import Role
from apps.plugins.models import PluginPermission

PLUGINS = ('tl_scorecard',)
STALE_PLUGINS = ('engagement',)


class Command(BaseCommand):
    help = 'Reconcile the hbpr role plugin view grants (tl_scorecard only).'

    def handle(self, *args, **options):
        role = Role.objects.filter(code='hbpr').first()
        if role is None:
            return
        granted = 0
        for row in PluginPermission.objects.filter(
            plugin_name__in=PLUGINS, action='view'
        ):
            if not row.allowed_roles.filter(pk=role.pk).exists():
                row.allowed_roles.add(role)
                granted += 1
        for row in PluginPermission.objects.filter(
            plugin_name__in=STALE_PLUGINS, action='view'
        ):
            row.allowed_roles.remove(role)
        if granted:
            self.stdout.write(f'hbpr granted view on {granted} plugin(s).')
