from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ticket_kpi', '0008_kpievidence'),
    ]

    operations = [
        migrations.AddField(
            model_name='monthlykpi',
            name='p50_resolution_hours',
            field=models.FloatField(blank=True, help_text='Median (p50) resolution time in hours', null=True),
        ),
        migrations.AddField(
            model_name='monthlykpi',
            name='p75_resolution_hours',
            field=models.FloatField(blank=True, help_text='75th percentile resolution time in hours', null=True),
        ),
        migrations.AddField(
            model_name='monthlykpi',
            name='p90_resolution_hours',
            field=models.FloatField(blank=True, help_text='90th percentile resolution time in hours', null=True),
        ),
    ]
