"""
Rotate and compress audit logs for the previous calendar month.

Can be run manually or automated via cron / task scheduler:
    py -3.14 manage.py rotate_audit_logs
    py -3.14 manage.py rotate_audit_logs --month 2026-09
    py -3.14 manage.py rotate_audit_logs --no-delete
"""

from django.core.management.base import BaseCommand, CommandError
from apps.reports.services.audit_archive import archive_month, get_archive_status


class Command(BaseCommand):
    help = "Compress and rotate previous month's audit logs into a .json.gz archive."

    def add_arguments(self, parser):
        parser.add_argument(
            '--month',
            type=str,
            default=None,
            help="Target calendar month to rotate in YYYY-MM format. Defaults to previous month.",
        )
        parser.add_argument(
            '--no-delete',
            action='store_true',
            default=False,
            help="Archive and compress without deleting records from the database (dry/backup mode).",
        )
        parser.add_argument(
            '--status',
            action='store_true',
            default=False,
            help="Show current status of eligible logs and existing archives without rotating.",
        )

    def handle(self, *args, **options):
        if options['status']:
            st = get_archive_status()
            self.stdout.write(self.style.SUCCESS(
                f"Target Month: {st['target_month_label']} ({st['target_month']})\n"
                f"Eligible records: {st['eligible_count']} (Core: {st['core_count']}, Plugin: {st['plugin_count']})\n"
                f"Existing Archives: {len(st['archives'])}"
            ))
            for a in st['archives']:
                self.stdout.write(f"  - {a['filename']} ({a['size_formatted']}, {a['created_at']})")
            return

        target_month = options['month']
        delete_after = not options['no_delete']

        try:
            result = archive_month(month_str=target_month, delete_after=delete_after)
        except Exception as exc:
            raise CommandError(f"Audit log rotation failed: {exc}")

        if result['archived_count'] == 0:
            self.stdout.write(self.style.WARNING(result.get('message', 'No records to archive.')))
        else:
            action_desc = "archived and pruned from DB" if delete_after else "archived (kept in DB)"
            self.stdout.write(self.style.SUCCESS(
                f"Successfully {action_desc} {result['archived_count']} logs for "
                f"{result['month_label']} -> {result['filename']} ({result.get('size_formatted', '')})"
            ))
