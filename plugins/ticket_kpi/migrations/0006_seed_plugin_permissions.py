from django.db import migrations


def seed_ticket_kpi_permissions(apps, schema_editor):
    """Create public PluginPermission records so all authenticated users can access ticket_kpi."""
    PluginPermission = apps.get_model('plugins', 'PluginPermission')

    permissions = [
        ('ticket_kpi', 'view', True),         # All users can see routes and read data
        ('ticket_kpi', 'manage', True),       # All users can upload files
        ('ticket_kpi', 'configure', False),   # Only staff/admin can manage profiles
    ]

    for plugin_name, action, is_public in permissions:
        obj, created = PluginPermission.objects.get_or_create(
            plugin_name=plugin_name,
            action=action,
            defaults={'is_public': is_public},
        )
        if not created and not obj.is_public:
            obj.is_public = is_public
            obj.save(update_fields=['is_public'])


def reverse_seed_ticket_kpi_permissions(apps, schema_editor):
    """Remove the seeded ticket_kpi permissions."""
    PluginPermission = apps.get_model('plugins', 'PluginPermission')
    PluginPermission.objects.filter(plugin_name='ticket_kpi', action__in=['view', 'manage']).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('ticket_kpi', '0005_exportprofile_assigned_clients'),
    ]

    operations = [
        migrations.RunPython(
            seed_ticket_kpi_permissions,
            reverse_code=reverse_seed_ticket_kpi_permissions,
        ),
    ]
