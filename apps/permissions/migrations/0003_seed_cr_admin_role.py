"""Seed the cr_admin role and its permissions.

The CR admin is a scoped admin that can only manage Control Room access
and view CR users on the Users page. Full staff/superusers always retain
all permissions; the cr_admin role grants a subset without granting
is_staff.

This migration also wires the cr_admin role into the plugin permission
system so ``PluginPermission.has_access(user)`` returns True for
``control_room:view`` and ``control_room:manage``. This makes both the
backend ``PluginPermissionMixin`` and the frontend ``canManage`` hook
work for CR admins without any special-casing.

Idempotent: re-running will not duplicate rows.
"""
from django.db import migrations


def seed_cr_admin_role(apps, schema_editor):
    Role = apps.get_model('permissions', 'Role')
    Permission = apps.get_model('permissions', 'Permission')
    RolePermission = apps.get_model('permissions', 'RolePermission')
    PluginPermission = apps.get_model('plugins', 'PluginPermission')

    role, _ = Role.objects.get_or_create(
        code='cr_admin',
        defaults={
            'name': 'Control Room Admin',
            'description': (
                'Scoped admin: can manage Control Room access and view '
                'CR users only. No other admin capabilities.'
            ),
        },
    )

    # RBAC Permission rows (for documentation / future has_permission checks)
    perms = {}
    for module, action, desc in [
        ('control_room', 'manage',
         'Manage Control Room access grants and team scopes.'),
        ('users', 'view_cr_only',
         'View users filtered to Control Room access holders only.'),
    ]:
        perm, _ = Permission.objects.get_or_create(
            module=module,
            action=action,
            defaults={'description': desc},
        )
        perms[f'{module}:{action}'] = perm

    for key, perm in perms.items():
        RolePermission.objects.get_or_create(role=role, permission=perm)

    # PluginPermission: allow cr_admin role to view + manage control_room.
    # get_or_create so this is idempotent and won't clobber existing config.
    for action in ('view', 'manage'):
        pp, _ = PluginPermission.objects.get_or_create(
            plugin_name='control_room',
            action=action,
        )
        pp.allowed_roles.add(role)


def remove_cr_admin_role(apps, schema_editor):
    Role = apps.get_model('permissions', 'Role')
    Permission = apps.get_model('permissions', 'Permission')
    RolePermission = apps.get_model('permissions', 'RolePermission')
    PluginPermission = apps.get_model('plugins', 'PluginPermission')

    try:
        role = Role.objects.get(code='cr_admin')
        # Remove role from any PluginPermission allowed_roles
        for pp in PluginPermission.objects.filter(allowed_roles=role):
            pp.allowed_roles.remove(role)
        RolePermission.objects.filter(role=role).delete()
        role.delete()
    except Role.DoesNotExist:
        pass

    Permission.objects.filter(
        module='control_room', action='manage'
    ).delete()
    Permission.objects.filter(
        module='users', action='view_cr_only'
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('permissions', '0002_permissionset_permissionsetitem'),
        ('plugins', '0008_rename_plugin_perm_plugin__idx_plugin_perm_plugin__0bb612_idx_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_cr_admin_role, remove_cr_admin_role),
    ]
