from django.db import migrations, models


OWN_EVENT_TYPES_DISABLED = (
    'own_leave_submitted',
    'own_leave_updated',
    'own_leave_edited',
    'own_overtime_submitted',
    'own_overtime_updated',
    'own_standby_submitted',
    'own_standby_updated',
)

TEAM_EVENT_TYPES_ENABLED = (
    'team_period_finalized',
    'team_action_required',
    'team_leave_deleted',
)


def seed_event_configs(apps, schema_editor):
    NotificationEventTypeConfig = apps.get_model(
        'notifications', 'NotificationEventTypeConfig'
    )
    NotificationEventTypeConfig.objects.bulk_create(
        [
            NotificationEventTypeConfig(event_type=t, is_enabled=False)
            for t in OWN_EVENT_TYPES_DISABLED
        ]
        + [
            NotificationEventTypeConfig(event_type=t, is_enabled=True)
            for t in TEAM_EVENT_TYPES_ENABLED
        ]
    )


class Migration(migrations.Migration):

    dependencies = [
        ('notifications', '0006_notification_dedupe_key_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='NotificationEventTypeConfig',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('event_type', models.CharField(max_length=40, unique=True)),
                ('is_enabled', models.BooleanField(default=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['event_type'],
            },
        ),
        migrations.RunPython(seed_event_configs, migrations.RunPython.noop),
    ]
