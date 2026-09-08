"""Add Italian TL and Albanian TL role fields to UserProfile."""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('users', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='is_italian_tl',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='is_albanian_tl',
            field=models.BooleanField(default=False),
        ),
        migrations.RemoveIndex(
            model_name='userprofile',
            name='user_profil_is_team_d8d24e_idx',
        ),
        migrations.RemoveField(
            model_name='userprofile',
            name='is_team_leader',
        ),
        migrations.AddIndex(
            model_name='userprofile',
            index=models.Index(fields=['is_italian_tl'], name='user_profil_is_ital_8f7a2e_idx'),
        ),
        migrations.AddIndex(
            model_name='userprofile',
            index=models.Index(fields=['is_albanian_tl'], name='user_profil_is_alba_9c3b1f_idx'),
        ),
    ]
