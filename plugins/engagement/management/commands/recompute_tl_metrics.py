"""
Management command to (re)compute TLApprovalMetric snapshots.

Usage:
    python manage.py recompute_tl_metrics
    python manage.py recompute_tl_metrics --month 2026-08-01
    python manage.py recompute_tl_metrics --leader-id 42
    python manage.py recompute_tl_metrics --all-months   # backfill every month with activity
"""
from datetime import date

from django.core.management.base import BaseCommand, CommandError

from core.utils.metrics_freeze import is_frozen
from plugins.engagement.models import TLApprovalMetric
from plugins.engagement.services import (
    compute_tl_metric,
    leader_team_pairs,
    months_with_activity,
    sync_manager_change_markers,
)
from core.utils.timezone_local import business_today


class Command(BaseCommand):
    help = 'Recompute TLApprovalMetric snapshots for team leaders.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--month',
            type=str,
            help='ISO date within the target month (default: current month, Europe/Tirana).',
        )
        parser.add_argument(
            '--leader-id',
            type=int,
            help='Only recompute for this leader user ID.',
        )
        parser.add_argument(
            '--include-frozen',
            action='store_true',
            help='Also rewrite snapshots that are already final (past the metrics freeze).',
        )
        parser.add_argument(
            '--all-months',
            action='store_true',
            help='Recompute every month that has a snapshot or a submitted request.',
        )

    @staticmethod
    def _is_final(leader, team, month):
        row = TLApprovalMetric.objects.filter(leader=leader, team=team, month=month).first()
        return bool(row and is_frozen(month, row.computed_at))

    def handle(self, *args, **options):
        month_raw = options.get('month')
        if month_raw:
            try:
                month = date.fromisoformat(month_raw)
            except ValueError:
                raise CommandError('--month must be an ISO date (YYYY-MM-DD)')
        else:
            month = business_today()
        months = months_with_activity() if options.get('all_months') else [month.replace(day=1)]

        leader_id = options.get('leader_id')
        pairs = leader_team_pairs()
        if leader_id:
            pairs = [(leader, team) for leader, team in pairs if leader.id == leader_id]
        pair_keys = {(leader.id, team.id) for leader, team in pairs}

        computed = 0
        pruned = 0
        sync_leaders = set()
        for target in months:
            target_month = target.replace(day=1)
            for leader, team in pairs:
                if not options.get('include_frozen') and self._is_final(leader, team, target_month):
                    continue
                compute_tl_metric(leader, team, target_month)
                computed += 1
                self.stdout.write(f'  Computed: leader={leader.username} team={team.name} month={target}')

            existing = TLApprovalMetric.objects.filter(month=target_month, team__isnull=False)
            if leader_id:
                existing = existing.filter(leader_id=leader_id)
            sync_leaders |= set(existing.values_list('leader_id', flat=True).distinct())
            orphan_pks = [
                row.pk
                for row in existing
                if (row.leader_id, row.team_id) not in pair_keys
                and (options.get('include_frozen') or not is_frozen(row.month, row.computed_at))
            ]
            if orphan_pks:
                pruned += TLApprovalMetric.objects.filter(pk__in=orphan_pks).delete()[0]

        if sync_leaders:
            sync_manager_change_markers(sync_leaders)

        if not pairs and not pruned:
            self.stdout.write(self.style.WARNING('No (leader, team) pairs found.'))
            return

        self.stdout.write(
            self.style.SUCCESS(f'Done: {computed} snapshot(s) computed, {pruned} pruned for {len(months)} month(s).')
        )
