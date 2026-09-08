from django.db import migrations


def seed_default_profile(apps, schema_editor):
    """Create a default ServiceNow export profile."""
    ExportProfile = apps.get_model('ticket_kpi', 'ExportProfile')
    User = apps.get_model('auth', 'User')

    # Find first admin/superuser to assign as creator
    admin = User.objects.filter(is_staff=True).first()

    ExportProfile.objects.get_or_create(
        name='ServiceNow Default',
        defaults={
            'description': (
                'Default mapping for ServiceNow incident exports. '
                'Maps Number, Short description, State, Opened, Resolved, Assigned to, Caller, Priority, Category.'
            ),
            'is_active': True,
            'field_mapping': {
                'ticket_id': 'Number',
                'title': 'Short description',
                'status': 'State',
                'created_at': 'Opened',
                'resolved_at': 'Resolved',
                'assignee': 'Assigned to',
                'requester': 'Caller',
                'priority': 'Priority',
                'category': 'Category',
            },
            'value_transforms': {
                'status': {
                    'new': 'open',
                    'in progress': 'open',
                    'on hold': 'open',
                    'awaiting info': 'open',
                    'resolved': 'closed',
                    'closed': 'closed',
                    'closed complete': 'closed',
                    'closed incomplete': 'closed',
                    'cancelled': 'cancelled',
                    'canceled': 'cancelled',
                    'reopened': 'open',
                },
                'priority': {
                    'p1 - critical': 'critical',
                    'p1': 'critical',
                    'critical': 'critical',
                    'p2 - high': 'high',
                    'p2': 'high',
                    'high': 'high',
                    'p3 - moderate': 'medium',
                    'p3': 'medium',
                    'moderate': 'medium',
                    'medium': 'medium',
                    'p4 - low': 'low',
                    'p4': 'low',
                    'low': 'low',
                    'p5 - planning': 'low',
                    'p5': 'low',
                    'planning': 'low',
                },
            },
            'required_fields': ['ticket_id', 'title', 'status', 'created_at'],
            'compute_resolution_time': True,
            'compute_sla': False,
            'is_global': True,
            'created_by': admin,
        }
    )


def reverse_seed(apps, schema_editor):
    ExportProfile = apps.get_model('ticket_kpi', 'ExportProfile')
    ExportProfile.objects.filter(name='ServiceNow Default').delete()


class Migration(migrations.Migration):
    dependencies = [
        ('ticket_kpi', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_default_profile, reverse_seed),
    ]
