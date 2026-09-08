from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('dashboard', '0002_calendarworkspace_calendarpermission_calendarentry_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='PublicHoliday',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('is_deleted', models.BooleanField(default=False)),
                ('deleted_at', models.DateTimeField(blank=True, null=True)),
                ('name', models.CharField(max_length=150)),
                ('date', models.DateField()),
                ('country_code', models.CharField(blank=True, help_text='ISO country code', max_length=2)),
                ('is_global', models.BooleanField(default=True)),
                ('description', models.TextField(blank=True)),
                ('calendar', models.ForeignKey(blank=True, help_text='Optional workspace this holiday belongs to. Null = global holiday.', null=True, on_delete=models.deletion.CASCADE, related_name='holidays', to='dashboard.calendarworkspace')),
                ('deleted_by', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, related_name='deleted_publicholiday', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'public_holidays',
                'ordering': ['date', 'name'],
                'unique_together': {('date', 'calendar', 'country_code')},
            },
        ),
    ]
