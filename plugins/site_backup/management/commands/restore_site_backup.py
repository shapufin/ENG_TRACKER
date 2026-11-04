"""Restore a site backup archive from the command line (headless server provisioning).

The admin UI needs a running app, a superuser and an HTTP upload of the whole
archive. On a new server run this instead, after migrations have created the
schema (same commit as the backup: the schema hash gate still applies):

    python manage.py restore_site_backup backup.zip --all --restore-media --yes

Two-factor secrets, sessions and year-close snapshots are never in the archive;
a full server move carries them through the database dump (see
docs/deploy/server-migration-checklist.md).
"""
from django.core.management.base import BaseCommand, CommandError

from plugins.site_backup.services import restore as restore_service
from plugins.site_backup.services.archive import ArchiveError


class Command(BaseCommand):
    help = 'Restore a site backup archive (database rows and, optionally, media).'

    def add_arguments(self, parser):
        parser.add_argument('archive_path', help='Path to the backup .zip on disk.')
        parser.add_argument('--all', action='store_true', help='Restore every model in the archive.')
        parser.add_argument('--models', help='Comma-separated model labels, e.g. auth.group,users.userprofile.')
        parser.add_argument(
            '--delete-missing', action='store_true',
            help='Delete rows that exist in the database but not in the backup (for the restored models).',
        )
        parser.add_argument('--restore-media', action='store_true', help='Extract media files into MEDIA_ROOT.')
        parser.add_argument('--yes', '-y', action='store_true', help='Do not ask for confirmation.')

    def handle(self, *args, **options):
        try:
            fh = open(options['archive_path'], 'rb')
        except OSError as exc:
            raise CommandError(f"Cannot open {options['archive_path']!r}: {exc.strerror}.")
        with fh:
            try:
                preview = restore_service.preview(fh)
            except ArchiveError as exc:
                raise CommandError(str(exc))
            if not preview['schema_compatible']:
                raise CommandError(
                    'Backup schema does not match the current database schema. Run the same '
                    'commit the backup was taken from and apply its migrations first.'
                )

            available = [group['model'] for group in preview['model_groups']]
            if options['all'] == bool(options['models']):
                raise CommandError('Pass exactly one of --all or --models.')
            approved = available if options['all'] else [
                label.strip() for label in options['models'].split(',') if label.strip()
            ]
            unknown = sorted(set(approved) - set(available))
            if unknown:
                raise CommandError(f"Not in the archive: {', '.join(unknown)}.")

            for group in preview['model_groups']:
                if group['model'] in approved:
                    self.stdout.write(
                        f"{group['model']}: {group['new']} new, {group['overwritten']} overwritten, "
                        f"{group['db_only']} not in backup"
                    )
            if options['delete_missing']:
                self.stdout.write(self.style.WARNING('Rows missing from the backup will be deleted.'))

            if not options['yes'] and input('Restore now? This overwrites data. [y/N] ').strip().lower() not in ('y', 'yes'):
                raise CommandError('Aborted; nothing was restored.')

            fh.seek(0)
            try:
                result = restore_service.commit(
                    fh,
                    approved_models=approved,
                    delete_missing_models=approved if options['delete_missing'] else None,
                    restore_media=options['restore_media'],
                    confirmed=True,
                )
            except (restore_service.RestoreError, ArchiveError) as exc:
                raise CommandError(str(exc))

        self.stdout.write(self.style.SUCCESS(
            f"Restored {sum(result['created'].values())} created, {sum(result['updated'].values())} updated, "
            f"{sum(result['deleted'].values())} deleted; {result['media_extracted']} media files extracted."
        ))
