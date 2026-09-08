from django.db import migrations, models


def populate_role_codes(apps, schema_editor):
    UserProfile = apps.get_model('users', 'UserProfile')
    UserRole = apps.get_model('permissions', 'UserRole')
    for profile in UserProfile.objects.all().iterator():
        profile.role_codes = sorted(
            UserRole.objects.filter(user_id=profile.user_id, is_active=True)
            .values_list('role__code', flat=True)
            .distinct()
        )
        profile.save(update_fields=['role_codes'])


def clear_role_codes(apps, schema_editor):
    UserProfile = apps.get_model('users', 'UserProfile')
    UserProfile.objects.update(role_codes=[])


class Migration(migrations.Migration):
    dependencies = [
        ('users', '0010_userprofile_clients'),
        ('permissions', '0004_seed_core_roles_permissions'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='role_codes',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.RunPython(populate_role_codes, clear_role_codes),
    ]
