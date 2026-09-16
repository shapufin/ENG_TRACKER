"""Adopt an explicit through model for UserProfile.techs — state only.

``UserProfile.techs`` started life as a plain M2M, so Django had already
created ``user_profiles_techs`` with columns ``id`` / ``userprofile_id`` /
``tech_id`` and a unique_together index over the two FKs. ``UserTech``
declares exactly that shape, so this migration teaches Django's state about
the model WITHOUT touching the database. Existing rows are left in place.

An auto-generated ``makemigrations`` migration would instead try to CREATE a
table that already exists and to alter the M2M in place, which Django does not
support for adding ``through=``. Do not regenerate this file.
"""
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0014_tech_userprofile_techs_tech_techs_code_f41d70_idx_and_more'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.CreateModel(
                    name='UserTech',
                    fields=[
                        ('id', models.BigAutoField(
                            auto_created=True, primary_key=True,
                            serialize=False, verbose_name='ID',
                        )),
                        ('tech', models.ForeignKey(
                            on_delete=django.db.models.deletion.CASCADE,
                            related_name='assignments',
                            to='users.tech',
                        )),
                        ('user_profile', models.ForeignKey(
                            db_column='userprofile_id',
                            on_delete=django.db.models.deletion.CASCADE,
                            related_name='tech_assignments',
                            to='users.userprofile',
                        )),
                    ],
                    options={
                        'db_table': 'user_profiles_techs',
                        'unique_together': {('user_profile', 'tech')},
                    },
                ),
                migrations.AlterField(
                    model_name='userprofile',
                    name='techs',
                    field=models.ManyToManyField(
                        blank=True,
                        related_name='users',
                        through='users.UserTech',
                        to='users.tech',
                    ),
                ),
            ],
        ),
    ]
