from django.db import migrations
from django.db.models import F


def backfill_submitted_at(apps, schema_editor):
    LeaveRequest = apps.get_model('leave_management', 'LeaveRequest')
    LeaveRequest.objects.filter(submitted_at__isnull=True).update(submitted_at=F('created_at'))


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('leave_management', '0008_add_submitted_at'),
    ]

    operations = [
        migrations.RunPython(backfill_submitted_at, noop_reverse),
    ]
