"""
Management command to recompute MonthlyKPI records from existing TicketImportBatch data.

Usage:
    python manage.py recompute_kpis
    python manage.py recompute_kpis --user-id 42
    python manage.py recompute_kpis --dry-run

This is useful when MonthlyKPI records are missing or stale because signals
were not connected (e.g. before the apps.py ready() fix was deployed).
"""

from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.db.models import Count

from plugins.ticket_kpi.models import TicketImportBatch, MonthlyKPI
from plugins.ticket_kpi.analytics import compute_monthly_kpi


class Command(BaseCommand):
    help = 'Recompute MonthlyKPI records from existing TicketImportBatch data.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--user-id',
            type=int,
            help='Only recompute for this user ID (default: all users with batches).',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be recomputed without making changes.',
        )

    def handle(self, *args, **options):
        user_id = options.get('user_id')
        dry_run = options.get('dry_run')

        queryset = TicketImportBatch.objects.filter(is_overridden=False)
        if user_id:
            queryset = queryset.filter(user_id=user_id)

        # Get distinct user/month pairs that have non-overridden batches
        pairs = (
            queryset.values('user_id', 'month')
            .annotate(batch_count=Count('id'))
            .order_by('user_id', 'month')
        )

        if not pairs:
            self.stdout.write(self.style.WARNING('No batches found to recompute.'))
            return

        self.stdout.write(f'Found {len(pairs)} user/month pair(s) to process.')

        recomputed = 0
        skipped = 0
        deleted = 0

        for pair in pairs:
            existing_kpi = MonthlyKPI.objects.filter(
                user_id=pair['user_id'], month=pair['month']
            ).first()

            if dry_run:
                if existing_kpi:
                    self.stdout.write(
                        f'  Would update: user={pair["user_id"]} '
                        f'month={pair["month"]} (current total={existing_kpi.total_tickets})'
                    )
                else:
                    self.stdout.write(
                        f'  Would create: user={pair["user_id"]} month={pair["month"]}'
                    )
                recomputed += 1
                continue

            kpi = compute_monthly_kpi(
                user=User.objects.get(id=pair['user_id']),
                month=pair['month'],
            )

            if kpi:
                recomputed += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f'  Recomputed: user={pair["user_id"]} '
                        f'month={pair["month"]} total_tickets={kpi.total_tickets}'
                    )
                )
            else:
                # compute_monthly_kpi returned None — no valid tickets found
                skipped += 1
                self.stdout.write(
                    self.style.WARNING(
                        f'  Skipped (no valid tickets): user={pair["user_id"]} '
                        f'month={pair["month"]}'
                    )
                )

        # Also clean up orphaned MonthlyKPI records — KPIs whose (user, month)
        # pair has no non-overridden batch. The old per-user check was too
        # coarse: it kept KPIs for months that had no batch as long as the user
        # had *some* batch in another month.
        active_pairs = TicketImportBatch.objects.filter(
            is_overridden=False
        ).values_list('user_id', 'month')
        active_pair_set = set(active_pairs)
        if user_id:
            active_pair_set = {
                (uid, m) for (uid, m) in active_pair_set if uid == user_id
            }

        orphaned_kpis = MonthlyKPI.objects.none()
        for kpi in MonthlyKPI.objects.all():
            if user_id and kpi.user_id != user_id:
                continue
            if (kpi.user_id, kpi.month) not in active_pair_set:
                orphaned_kpis = orphaned_kpis | MonthlyKPI.objects.filter(pk=kpi.pk)

        orphaned_count = orphaned_kpis.count()
        if orphaned_count > 0:
            if dry_run:
                self.stdout.write(
                    self.style.WARNING(
                        f'Would delete {orphaned_count} orphaned MonthlyKPI record(s).'
                    )
                )
            else:
                orphaned_kpis.delete()
                self.stdout.write(
                    self.style.WARNING(
                        f'Deleted {orphaned_count} orphaned MonthlyKPI record(s).'
                    )
                )
            deleted = orphaned_count

        if dry_run:
            self.stdout.write(
                self.style.SUCCESS(
                    f'Dry run complete: {recomputed} would be recomputed, '
                    f'{deleted} would be deleted, {skipped} skipped.'
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f'Done: {recomputed} recomputed, {deleted} deleted, {skipped} skipped.'
                )
            )
