from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('engagement', '0002_tlapprovalmetric_decisions_during_leave'),
    ]

    operations = [
        migrations.RenameField(
            model_name='tlapprovalmetric',
            old_name='score_activity',
            new_name='score_responsiveness',
        ),
        migrations.AddField(
            model_name='tlapprovalmetric',
            name='decisions_on_holidays',
            field=models.PositiveIntegerField(default=0, help_text='Team-member requests this leader decided on a public holiday (evidence, not scored).'),
        ),
        migrations.AddField(
            model_name='tlapprovalmetric',
            name='next_deadline_at',
            field=models.DateTimeField(blank=True, help_text='Earliest deadline among pending requests not yet past due; passing it makes the snapshot stale.', null=True),
        ),
    ]
