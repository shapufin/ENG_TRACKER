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
        # Pinned to the migration that actually creates the PluginPermission
        # table. It used to be ('plugins', '__latest__'), which made this
        # already-applied migration depend on every FUTURE plugins migration —
        # adding one (e.g. 0010_seed_hbpr_plugin_denial) then tripped
        # InconsistentMigrationHistory on any DB where this row was applied.
        ('plugins', '0007_plugin_permission_system'),
    ]
    operations = [migrations.RunPython(grant, revoke)]
