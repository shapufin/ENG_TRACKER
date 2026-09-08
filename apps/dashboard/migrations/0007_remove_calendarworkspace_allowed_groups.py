from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('dashboard', '0006_add_admin_dashboard_type'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='calendarworkspace',
            name='allowed_groups',
        ),
    ]
