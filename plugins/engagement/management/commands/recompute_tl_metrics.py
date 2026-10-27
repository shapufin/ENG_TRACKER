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
from plugins.engagement.services import compute_tl_metric, leader_team_pairs, months_with_activity
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

        if not pairs:
            self.stdout.write(self.style.WARNING('No (leader, team) pairs found.'))
            return

        computed = 0
        for target in months:
            for leader, team in pairs:
                if not options.get('include_frozen') and self._is_final(leader, team, target.replace(day=1)):
                    continue
                compute_tl_metric(leader, team, target.replace(day=1))
                computed += 1
                self.stdout.write(f'  Computed: leader={leader.username} team={team.name} month={target}')

        self.stdout.write(self.style.SUCCESS(f'Done: {computed} snapshot(s) computed for {len(months)} month(s).'))
