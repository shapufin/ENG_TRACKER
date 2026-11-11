"""
Create the Line Manager's mid-year / year-end partnership rows for employee EPR stages that
were completed with the HBPR present before the rows were created automatically.

Usage:
    python manage.py backfill_hbpr_epr_evidence --dry-run
    python manage.py backfill_hbpr_epr_evidence

Idempotent: a row already present for the assignment, kind and year is left alone. A stage
whose Line Manager had no HBPR assignment on the day it was completed is skipped.
"""
from django.core.management.base import BaseCommand

from plugins.tl_scorecard.hbpr_evidence import EVIDENCE_KIND, log_attended_stage
from plugins.tl_scorecard.models import EPRStageRecord


class Command(BaseCommand):
    help = "Backfill partnership evidence from EPR stages the HBPR attended."

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Report what would be created.')

    def handle(self, *args, **options):
        created = skipped = 0
        records = (
            EPRStageRecord.objects.filter(hbpr_present=True, stage__in=EVIDENCE_KIND)
            .select_related('cycle__user__profile', 'recorded_by')
            .order_by('created_at', 'id')
        )
        for record in records:
            held_on = getattr(record.cycle, f'{record.stage}_completed_at')
            held_on = held_on.date() if held_on else record.created_at.date()
            if options['dry_run']:
                self.stdout.write(f'would log {record.stage} for cycle {record.cycle_id} ({held_on})')
                created += 1
                continue
            _row, was_created = log_attended_stage(
                record.cycle, record.stage, record.recorded_by, on_date=held_on)
            created += int(was_created)
            skipped += int(not was_created)
        verb = 'Would create' if options['dry_run'] else 'Created'
        self.stdout.write(self.style.SUCCESS(f'{verb} {created} row(s); {skipped} already present or skipped.'))
