"""Create or repair the Backup team's import profile (safe to run on any environment).

The profile reads only the 13 columns the team needs out of the service desk download
(90+ columns, a decoy "Filters" sheet, a title row above the header) and reads its
text dates day-first. Re-running restores these values if someone edited them.
"""
from django.core.management.base import BaseCommand

from plugins.ticket_kpi.models import ExportProfile

PROFILE_NAME = 'Backup team (service desk export)'

BACKUP_COLUMNS = (
    'Code', 'Status', 'Request Type', 'Requester Org.', 'CE', 'Origination', 'Validator',
    'Analyst', 'Driver Group', 'Summary', 'Solutions', 'Open Date', 'Close Date',
)

BACKUP_PROFILE = {
    'description': (
        'The Backup team monthly download. Reads Code, Status, Request Type, Requester Org., CE, '
        'Origination, Validator, Analyst, Driver Group, Summary, Solutions, Open Date and Close '
        'Date; every other column is ignored. Dates are day/month/year.'
    ),
    'is_active': True,
    'is_global': True,
    'field_mapping': {
        'ticket_id': 'Code',
        'title': 'Summary',
        'status': 'Status',
        'created_at': 'Open Date',
        'resolved_at': 'Close Date',
        'assignee': 'Analyst',
        'requester': 'Requester Org.',
        'category': 'Request Type',
    },
    # The default transform lowercases a bare "Closed"; keep the export's own wording.
    'value_transforms': {'status': {'closed': 'Closed'}},
    'required_fields': ['ticket_id', 'status', 'created_at'],
    'keep_columns': list(BACKUP_COLUMNS),
    'date_format': '%d/%m/%Y %H:%M',
    'compute_resolution_time': True,
    'compute_sla': False,
}


class Command(BaseCommand):
    help = 'Create or repair the Backup team import profile.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--if-missing', action='store_true',
            help='Create the profile only when absent; never touch an existing one (used at boot).',
        )

    def handle(self, *args, **options):
        if options.get('if_missing'):
            profile, created = ExportProfile.objects.get_or_create(
                name=PROFILE_NAME, defaults=BACKUP_PROFILE
            )
        else:
            profile, created = ExportProfile.objects.update_or_create(
                name=PROFILE_NAME, defaults=BACKUP_PROFILE
            )
        if options.get('verbosity', 1):
            self.stdout.write(f"{'Created' if created else 'Updated'} profile '{profile.name}' (id {profile.id}).")
