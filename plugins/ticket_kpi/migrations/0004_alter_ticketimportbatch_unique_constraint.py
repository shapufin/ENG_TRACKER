# Generated manually 2026-06-19

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ticket_kpi', '0003_monthlykpi_field_breakdowns_and_more'),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name='ticketimportbatch',
            unique_together=set(),
        ),
        migrations.AddConstraint(
            model_name='ticketimportbatch',
            constraint=models.UniqueConstraint(
                condition=models.Q(('is_overridden', False)),
                fields=('user', 'month'),
                name='unique_active_upload_per_month',
            ),
        ),
    ]
