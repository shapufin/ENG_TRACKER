"""Add the per-Tech level scale and the level held in each Tech assignment.

Real DDL, unlike 0015: creates ``tech_levels`` and adds the three new columns
to the ``user_profiles_techs`` table 0015 adopted. Every added column is
nullable, so existing assignment rows survive as "assigned but ungraded" and
``assigned_at`` is honestly null for rows created before levels existed.
"""
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0015_usertech_through_state_only'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='TechLevel',
            fields=[
                ('id', models.BigAutoField(
                    auto_created=True, primary_key=True,
                    serialize=False, verbose_name='ID',
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('is_deleted', models.BooleanField(default=False)),
                ('deleted_at', models.DateTimeField(blank=True, null=True)),
                ('name', models.CharField(max_length=50)),
                ('code', models.CharField(max_length=20)),
                ('rank', models.PositiveSmallIntegerField(
                    help_text='Order within the Tech; higher means more senior.',
                )),
                ('description', models.TextField(blank=True)),
                ('is_active', models.BooleanField(db_index=True, default=True)),
                ('deleted_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='deleted_%(class)s',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('tech', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='levels',
                    to='users.tech',
                )),
            ],
            options={
                'db_table': 'tech_levels',
                'ordering': ['tech', 'rank'],
            },
        ),
        migrations.AddField(
            model_name='usertech',
            name='level',
            field=models.ForeignKey(
                blank=True,
                help_text='Grade held in this Tech. Null means assigned but ungraded.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='assignments',
                to='users.techlevel',
            ),
        ),
        migrations.AddField(
            model_name='usertech',
            name='assigned_at',
            field=models.DateTimeField(
                blank=True,
                help_text='Null for rows created before levels existed.',
                null=True,
            ),
        ),
        migrations.AddField(
            model_name='usertech',
            name='assigned_by',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='tech_assignments_made',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddIndex(
            model_name='techlevel',
            index=models.Index(fields=['tech', 'rank'], name='tech_levels_tech_id_612097_idx'),
        ),
        migrations.AddIndex(
            model_name='techlevel',
            index=models.Index(fields=['is_active'], name='tech_levels_is_acti_a9406f_idx'),
        ),
        migrations.AddConstraint(
            model_name='techlevel',
            constraint=models.UniqueConstraint(fields=('tech', 'code'), name='tech_level_code_unique'),
        ),
        migrations.AddConstraint(
            model_name='techlevel',
            constraint=models.UniqueConstraint(fields=('tech', 'name'), name='tech_level_name_unique'),
        ),
        migrations.AddConstraint(
            model_name='techlevel',
            constraint=models.UniqueConstraint(fields=('tech', 'rank'), name='tech_level_rank_unique'),
        ),
        migrations.AddIndex(
            model_name='usertech',
            index=models.Index(fields=['tech', 'level'], name='user_profil_tech_id_b4db70_idx'),
        ),
        migrations.AddIndex(
            model_name='usertech',
            index=models.Index(fields=['level'], name='user_profil_level_i_f3a010_idx'),
        ),
    ]
