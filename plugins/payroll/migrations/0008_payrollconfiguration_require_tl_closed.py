from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('payroll', '0007_payrollline_carryover_breakdown_payrollrunentry'),
    ]

    operations = [
        migrations.AddField(
            model_name='payrollconfiguration',
            name='require_tl_closed_before_finalize',
            field=models.BooleanField(
                default=False,
                help_text='If true, all payroll users must have a TL-closed approval period.',
                verbose_name='Require TL Closure Before Finalize',
            ),
        ),
    ]
