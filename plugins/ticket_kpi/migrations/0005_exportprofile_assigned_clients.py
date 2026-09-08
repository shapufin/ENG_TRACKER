# Generated manually 2026-06-19

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ticket_kpi', '0004_alter_ticketimportbatch_unique_constraint'),
    ]

    operations = [
        migrations.AddField(
            model_name='exportprofile',
            name='assigned_clients',
            field=models.ManyToManyField(
                blank=True,
                help_text='Clients that can use this profile (empty = unrestricted)',
                related_name='export_profiles',
                to='overtime.client',
            ),
        ),
    ]
