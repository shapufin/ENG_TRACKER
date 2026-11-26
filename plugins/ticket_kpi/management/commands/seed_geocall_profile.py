"""Create or repair the Geocall Standard import profile (safe to run on any environment).

It reads the same service desk download as the Backup profile, plus Incident Severity
(shown as priority) and the Requester's name.
"""
from .seed_backup_profile import BACKUP_COLUMNS, BACKUP_PROFILE
from .seed_backup_profile import Command as SeedProfileCommand

PROFILE_NAME = 'Geocall Standard'

GEOCALL_COLUMNS = BACKUP_COLUMNS + ('Incident Severity', 'Requester')

GEOCALL_PROFILE = {
    **BACKUP_PROFILE,
    'description': (
        'The standard Geocall service desk download. Reads Code, Status, Request Type, '
        'Requester Org., CE, Origination, Validator, Analyst, Driver Group, Summary, Solutions, '
        'Open Date, Close Date, Incident Severity and Requester; every other column is ignored. '
        'Dates are day/month/year.'
    ),
    'field_mapping': {
        **BACKUP_PROFILE['field_mapping'],
        'priority': 'Incident Severity',
        'requester': 'Requester',
    },
    'keep_columns': list(GEOCALL_COLUMNS),
}


class Command(SeedProfileCommand):
    help = 'Create or repair the Geocall Standard import profile.'
    profile_name = PROFILE_NAME
    profile_values = GEOCALL_PROFILE
