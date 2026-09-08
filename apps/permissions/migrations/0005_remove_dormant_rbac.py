from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('permissions', '0004_seed_core_roles_permissions'),
    ]

    operations = [
        migrations.DeleteModel(name='GroupPermission'),
        migrations.DeleteModel(name='TeamPermission'),
        migrations.DeleteModel(name='PermissionDelegation'),
        migrations.DeleteModel(name='PermissionSetItem'),
        migrations.DeleteModel(name='PermissionSet'),
    ]
