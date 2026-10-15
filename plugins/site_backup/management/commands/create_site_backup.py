"""Create a site backup from the command line (same service as the admin POST).

The admin API builds the archive inside the web request, which is fine for a
small MEDIA_ROOT but can exceed the gunicorn timeout for a large one (no task
queue exists: decision D3). For those sites run this from a shell or cron:

    python manage.py create_site_backup --note "nightly"

Restore still goes through the superuser-only restore endpoints.
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from plugins.site_backup.services import backup as backup_service


class Command(BaseCommand):
    help = 'Create a site backup archive (database dump plus media) and register it.'

    def add_arguments(self, parser):
        parser.add_argument('--note', default='', help='Free-text note stored on the backup (max 255).')
        parser.add_argument('--no-media', action='store_true', help='Back up the database only.')
        parser.add_argument('--user', help='Username to record as the creator (default: none).')

    def handle(self, *args, **options):
        user = None
        if options['user']:
            user = get_user_model().objects.filter(username=options['user']).first()
            if user is None:
                raise CommandError(f"No user named {options['user']!r}.")
        record = backup_service.create_backup(
            user=user,
            note=options['note'][:255],
            include_media=not options['no_media'],
        )
        self.stdout.write(
            f'Created {record.filename} ({record.size_bytes} bytes, '
            f'{record.db_row_count} DB rows, {record.media_file_count} media files).'
        )
