"""Seed the ``hbpr`` role (HR Business Partner for Italy).

Flagless role like ``cr_admin``: a ``Role`` row plus ``UserRole`` assignments.
The code avoids the substring ``hr`` because some ORM filters use
``role_codes__icontains='hr'``.
"""
from django.db import migrations


def seed_hbpr_role(apps, schema_editor):
    Role = apps.get_model('permissions', 'Role')
    Role.objects.get_or_create(
        code='hbpr',
        defaults={
            'name': 'HR Business Partner (Italy)',
            'description': (
                'Business partner for Italian team leaders and their teams. '
                'Read access to their scorecard records, plus participation '
                '(PIP approval, promotion decisions, 1-on-1 notes). No '
                'overtime, standby or payroll.'
            ),
        },
    )


def remove_hbpr_role(apps, schema_editor):
    Role = apps.get_model('permissions', 'Role')
    Role.objects.filter(code='hbpr').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('permissions', '0005_remove_dormant_rbac'),
    ]

    operations = [
        migrations.RunPython(seed_hbpr_role, remove_hbpr_role),
    ]
