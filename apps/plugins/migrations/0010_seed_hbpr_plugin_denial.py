"""Seed HBPR-only plugin denial for databases that predate the denial fields.

Manifest sync reconciles manifest-owned denial/override sets on every boot, so
fresh databases get this from the manifests. Databases that already have
PluginPermission rows need the denial applied once; this migration does that
idempotently (and reverses it on rollback). The override lists mirror each
plugin's own manifest exactly — engagement is TL-only, the other three also
admit HR and CR admin.
"""
from django.db import migrations

# plugin -> denial_override_roles, matching each plugin's get_permission_manifest()
BLOCKED_PLUGINS = {
    'engagement': ('italian_tl', 'albanian_tl'),
    'organigrama': ('hr', 'italian_tl', 'albanian_tl', 'cr_admin'),
    'skills': ('hr', 'italian_tl', 'albanian_tl', 'cr_admin'),
    'ticket_kpi': ('hr', 'italian_tl', 'albanian_tl', 'cr_admin'),
}


def seed_denials(apps, schema_editor):
    Role = apps.get_model('permissions', 'Role')
    PluginPermission = apps.get_model('plugins', 'PluginPermission')
    hbpr = Role.objects.filter(code='hbpr').first()
    if hbpr is None:
        return
    for plugin_name, override_codes in BLOCKED_PLUGINS.items():
        overrides = list(Role.objects.filter(code__in=override_codes))
        for row in PluginPermission.objects.filter(
            plugin_name=plugin_name, action='view'
        ):
            row.denied_roles.add(hbpr)
            row.denial_override_roles.set(overrides)


def unseed_denials(apps, schema_editor):
    Role = apps.get_model('permissions', 'Role')
    PluginPermission = apps.get_model('plugins', 'PluginPermission')
    hbpr = Role.objects.filter(code='hbpr').first()
    if hbpr is None:
        return
    for row in PluginPermission.objects.filter(
        plugin_name__in=BLOCKED_PLUGINS
    ):
        row.denied_roles.remove(hbpr)
        row.denial_override_roles.clear()


class Migration(migrations.Migration):
    dependencies = [
        ('plugins', '0009_pluginpermission_denial_override_roles_and_more'),
    ]
    operations = [migrations.RunPython(seed_denials, unseed_denials)]
