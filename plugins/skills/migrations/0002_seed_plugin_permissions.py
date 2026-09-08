from django.db import migrations


def seed_skills_permissions(apps, schema_editor):
    """Create PluginPermission records for the skills plugin.

    - view: public=True (all authenticated users can access self-service
      endpoints; UserSkillViewSet maps all actions to 'view')
    - manage: public=False (HR-only for catalog CRUD)
    - configure: public=False (HR-only for catalog configuration)
    """
    PluginPermission = apps.get_model('plugins', 'PluginPermission')

    permissions = [
        ('skills', 'view', True),         # All users can self-service + read
        ('skills', 'manage', False),      # HR-only: catalog CRUD
        ('skills', 'configure', False),   # HR-only: catalog configuration
    ]

    for plugin_name, action, is_public in permissions:
        obj, created = PluginPermission.objects.get_or_create(
            plugin_name=plugin_name,
            action=action,
            defaults={'is_public': is_public},
        )
        if not created and obj.is_public != is_public:
            obj.is_public = is_public
            obj.save(update_fields=['is_public'])


def reverse_seed_skills_permissions(apps, schema_editor):
    """Remove the seeded skills permissions."""
    PluginPermission = apps.get_model('plugins', 'PluginPermission')
    PluginPermission.objects.filter(
        plugin_name='skills',
        action__in=['view', 'manage', 'configure'],
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('plugins', '0007_plugin_permission_system'),
        ('skills', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(
            seed_skills_permissions,
            reverse_code=reverse_seed_skills_permissions,
        ),
    ]
