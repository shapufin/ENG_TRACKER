# Generated migration for plugin permission system

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('permissions', '0002_permissionset_permissionsetitem'),
        ('plugins', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='PluginPermission',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('plugin_name', models.CharField(help_text="Name of the plugin (e.g., 'analytics', 'budget')", max_length=100)),
                ('action', models.CharField(choices=[('view', 'View'), ('manage', 'Manage'), ('configure', 'Configure'), ('export', 'Export')], help_text='Action type (view, manage, configure, export)', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('allowed_groups', models.ManyToManyField(blank=True, help_text='Groups that have access to this plugin action', related_name='plugin_permissions', to='permissions.group')),
                ('allowed_roles', models.ManyToManyField(blank=True, help_text='Roles that have access to this plugin action', related_name='plugin_permissions', to='permissions.role')),
            ],
            options={
                'db_table': 'plugin_permissions',
                'ordering': ['plugin_name', 'action'],
            },
        ),
        migrations.AddIndex(
            model_name='pluginpermission',
            index=models.Index(fields=['plugin_name'], name='plugin_perm_plugin__idx'),
        ),
        migrations.AddIndex(
            model_name='pluginpermission',
            index=models.Index(fields=['action'], name='plugin_perm_action_idx'),
        ),
        migrations.AlterUniqueTogether(
            name='pluginpermission',
            unique_together={('plugin_name', 'action')},
        ),
    ]
