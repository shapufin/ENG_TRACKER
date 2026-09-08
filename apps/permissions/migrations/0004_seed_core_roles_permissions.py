from django.db import migrations


ROLES = {
    'employee': ('Employee', 'Default employee capabilities.'),
    'italian_tl': ('Italian Team Leader', 'Team approval capabilities; scope comes from team assignments.'),
    'albanian_tl': ('Albanian Team Leader', 'Team approval capabilities; scope comes from team assignments.'),
    'hr': ('HR', 'Read/report capabilities across the organization; no write access by default.'),
    'admin': ('Administrator', 'Full application capabilities; Django is_staff remains the admin gate.'),
}

PERMISSIONS = {
    'overtime:view_own': ('overtime', 'view_own', 'View own overtime entries.'),
    'overtime:create': ('overtime', 'create', 'Create overtime entries.'),
    'overtime:view_team': ('overtime', 'view_team', 'View team overtime entries.'),
    'overtime:approve_team': ('overtime', 'approve_team', 'Approve team overtime entries.'),
    'overtime:view_all': ('overtime', 'view_all', 'View all overtime entries.'),
    'standby:view_own': ('standby', 'view_own', 'View own standby entries.'),
    'standby:create': ('standby', 'create', 'Create standby entries.'),
    'standby:view_team': ('standby', 'view_team', 'View team standby entries.'),
    'standby:approve_team': ('standby', 'approve_team', 'Approve team standby entries.'),
    'standby:view_all': ('standby', 'view_all', 'View all standby entries.'),
    'leave:view_own': ('leave', 'view_own', 'View own leave requests.'),
    'leave:create': ('leave', 'create', 'Create leave requests.'),
    'leave:view_team': ('leave', 'view_team', 'View team leave requests.'),
    'leave:approve_team': ('leave', 'approve_team', 'Approve team leave requests.'),
    'leave:view_all': ('leave', 'view_all', 'View all leave requests.'),
    'reports:view_all': ('reports', 'view_all', 'View organization-wide reports.'),
    'reports:export': ('reports', 'export', 'Export reports.'),
    'control_room:manage': ('control_room', 'manage', 'Manage Control Room access.'),
    'users:view_cr_only': ('users', 'view_cr_only', 'View users scoped to Control Room access.'),
}

ROLE_PERMISSIONS = {
    'employee': (
        'overtime:view_own', 'overtime:create', 'standby:view_own', 'standby:create',
        'leave:view_own', 'leave:create',
    ),
    'italian_tl': (
        'overtime:view_team', 'overtime:approve_team', 'standby:view_team',
        'standby:approve_team', 'leave:view_team', 'leave:approve_team',
    ),
    'albanian_tl': (
        'overtime:view_team', 'overtime:approve_team', 'standby:view_team',
        'standby:approve_team', 'leave:view_team', 'leave:approve_team',
    ),
    'hr': (
        'overtime:view_all', 'standby:view_all', 'leave:view_all',
        'reports:view_all', 'reports:export',
    ),
}


def seed_roles_and_permissions(apps, schema_editor):
    Role = apps.get_model('permissions', 'Role')
    Permission = apps.get_model('permissions', 'Permission')
    RolePermission = apps.get_model('permissions', 'RolePermission')

    role_objects = {}
    for code, (name, description) in ROLES.items():
        role, _ = Role.objects.get_or_create(
            code=code,
            defaults={'name': name, 'description': description},
        )
        role_objects[code] = role

    permission_objects = {}
    for code, (module, action, description) in PERMISSIONS.items():
        permission, _ = Permission.objects.get_or_create(
            module=module,
            action=action,
            defaults={'description': description},
        )
        permission_objects[code] = permission

    for role_code, permission_codes in ROLE_PERMISSIONS.items():
        role = role_objects[role_code]
        for permission_code in permission_codes:
            RolePermission.objects.get_or_create(
                role=role,
                permission=permission_objects[permission_code],
            )


def unseed_roles_and_permissions(apps, schema_editor):
    Role = apps.get_model('permissions', 'Role')
    Permission = apps.get_model('permissions', 'Permission')
    RolePermission = apps.get_model('permissions', 'RolePermission')
    role_codes = tuple(ROLES)
    permission_keys = tuple(PERMISSIONS)
    RolePermission.objects.filter(role__code__in=role_codes).delete()
    for key in permission_keys:
        module, action, _ = PERMISSIONS[key]
        Permission.objects.filter(module=module, action=action).delete()
    Role.objects.filter(code__in=role_codes).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('permissions', '0003_seed_cr_admin_role'),
    ]

    operations = [
        migrations.RunPython(seed_roles_and_permissions, unseed_roles_and_permissions),
    ]
