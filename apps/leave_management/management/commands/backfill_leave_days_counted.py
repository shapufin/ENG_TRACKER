from django.core.management.base import BaseCommand
from django.db import transaction
from decimal import Decimal

from apps.leave_management.models import LeaveRequest
from apps.leave_management.models.core import count_business_days


class Command(BaseCommand):
    help = (
        "Snapshot days_counted for leave requests created before the counted-days "
        "snapshot existed. Uses the weekday count those balances were moved with "
        "(holidays were not excluded then), so existing balances stay exact."
    )

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Report only; write nothing.')

    def handle(self, *args, **options):
        pending = LeaveRequest.objects.filter(days_counted__isnull=True)
        total = pending.count()
        if options['dry_run']:
            self.stdout.write(f'{total} request(s) would be snapshotted (dry run).')
            return
        updated = 0
        with transaction.atomic():
            # update() rather than save(): save() re-runs clean(), which would reject an
            # old request whose weekdays are now all holidays and abort the backfill.
            for request in pending.iterator():
                days = Decimal(count_business_days(request.start_date, request.end_date))
                updated += LeaveRequest.objects.filter(pk=request.pk).update(days_counted=days)
        self.stdout.write(self.style.SUCCESS(f'Snapshotted {updated} of {total} request(s).'))
