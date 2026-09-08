"""
Add start_time, end_time, and evidence_type to OvertimeLog.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('overtime', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='overtimelog',
            name='start_time',
            field=models.TimeField(blank=True, help_text='Start time in 24h format', null=True),
        ),
        migrations.AddField(
            model_name='overtimelog',
            name='end_time',
            field=models.TimeField(blank=True, help_text='End time in 24h format', null=True),
        ),
        migrations.AddField(
            model_name='overtimelog',
            name='evidence_type',
            field=models.CharField(
                blank=True,
                choices=[('ticket', 'Ticket'), ('email', 'Email'), ('call', 'Call'), ('other', 'Other')],
                default='other',
                max_length=20,
            ),
        ),
    ]
