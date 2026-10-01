from django.db import migrations

# Manifest sync only creates missing PluginPermission rows, so existing databases
# need the new role added once. Fresh databases get it from the manifests.
PLUGINS = ('tl_scorecard', 'engagement')


def grant(apps, schema_editor):
    Role = apps.get_model('permissions', 'Role')
    PluginPermission = apps.get_model('plugins', 'PluginPermission')
    role = Role.objects.filter(code='hbpr').first()
    if role is None:
        return
    for row in PluginPermission.objects.filter(plugin_name__in=PLUGINS, action='view'):
        row.allowed_roles.add(role)


def revoke(apps, schema_editor):
    Role = apps.get_model('permissions', 'Role')
    PluginPermission = apps.get_model('plugins', 'PluginPermission')
    role = Role.objects.filter(code='hbpr').first()
    if role is None:
        return
    for row in PluginPermission.objects.filter(plugin_name__in=PLUGINS, action='view'):
        row.allowed_roles.remove(role)


class Migration(migrations.Migration):
    dependencies = [
        ('permissions', '0006_seed_hbpr_role'),
        ('plugins', '__latest__'),
    ]
    operations = [migrations.RunPython(grant, revoke)]
