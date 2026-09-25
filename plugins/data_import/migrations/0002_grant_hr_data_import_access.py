"""Grant the ``hr`` role the data_import tool for view and manage.

The manifest change in ``DataImportPlugin.get_permission_manifest`` only
applies to *new* permission rows (``sync_plugin_permission_manifest`` keeps
existing rows untouched unless explicitly reset), so an already-seeded
database would never pick the role up. This migration adds ``hr`` to the
existing rows — or creates them when the plugin has never been seeded.

Reverse removes the role again but keeps the rows: they may predate this
migration and carry administrator customizations.
"""

from django.db import migrations


PLUGIN = 'data_import'
ACTIONS = ('view', 'manage')
HR_ROLE_CODE = 'hr'


def grant_hr_access(apps, schema_editor):
    PluginPermission = apps.get_model('plugins', 'PluginPermission')
    Role = apps.get_model('permissions', 'Role')

    role = Role.objects.filter(code=HR_ROLE_CODE).first()
    if role is None:
        # The role seed (permissions 0004) is a dependency, so this only
        # happens if an administrator deleted the role afterwards.
        return

    for action in ACTIONS:
        permission, _created = PluginPermission.objects.get_or_create(
            plugin_name=PLUGIN,
            action=action,
            defaults={'is_public': False},
        )
        permission.allowed_roles.add(role)


def revoke_hr_access(apps, schema_editor):
    PluginPermission = apps.get_model('plugins', 'PluginPermission')
    Role = apps.get_model('permissions', 'Role')

    role = Role.objects.filter(code=HR_ROLE_CODE).first()
    if role is None:
        return

    for permission in PluginPermission.objects.filter(
        plugin_name=PLUGIN, action__in=ACTIONS
    ):
        permission.allowed_roles.remove(role)


class Migration(migrations.Migration):

    dependencies = [
        ('plugins', '0007_plugin_permission_system'),
        ('permissions', '0004_seed_core_roles_permissions'),
        ('data_import', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(grant_hr_access, revoke_hr_access),
    ]
