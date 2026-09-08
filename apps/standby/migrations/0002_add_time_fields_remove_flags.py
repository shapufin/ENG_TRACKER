"""
Add start_time/end_time to StandbyLog; remove is_weekend and is_holiday.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('standby', '0001_initial'),
    ]

    operations = [
        migrations.RemoveIndex(
            model_name='standbylog',
            name='standby_log_is_week_8fa7a8_idx',
        ),
        migrations.RemoveIndex(
            model_name='standbylog',
            name='standby_log_is_holi_d6d9f6_idx',
        ),
        migrations.RemoveField(
            model_name='standbylog',
            name='is_holiday',
        ),
        migrations.RemoveField(
            model_name='standbylog',
            name='is_weekend',
        ),
        migrations.AddField(
            model_name='standbylog',
            name='start_time',
            field=models.TimeField(blank=True, help_text='Start time in 24h format', null=True),
        ),
        migrations.AddField(
            model_name='standbylog',
            name='end_time',
            field=models.TimeField(blank=True, help_text='End time in 24h format', null=True),
        ),
    ]
