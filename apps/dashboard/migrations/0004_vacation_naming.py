from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('dashboard', '0003_calendarworkspace_team_and_more'),
        ('dashboard', '0003_publicholiday'),
    ]

    operations = [
        migrations.RenameField(
            model_name='calendarworkspace',
            old_name='show_leave',
            new_name='show_vacation',
        ),
        migrations.AlterField(
            model_name='calendarentry',
            name='entry_type',
            field=models.CharField(
                choices=[
                    ('overtime', 'Overtime'),
                    ('standby', 'Standby'),
                    ('vacation', 'Vacation'),
                    ('holiday', 'Holiday'),
                    ('custom', 'Custom Event'),
                ],
                max_length=20,
            ),
        ),
    ]
