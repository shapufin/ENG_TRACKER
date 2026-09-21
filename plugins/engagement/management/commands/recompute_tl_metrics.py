"""
Management command to (re)compute TLApprovalMetric snapshots.

Usage:
    python manage.py recompute_tl_metrics
    python manage.py recompute_tl_metrics --month 2026-08-01
    python manage.py recompute_tl_metrics --leader-id 42
"""
from datetime import date

from django.core.management.base import BaseCommand, CommandError

from plugins.engagement.services import compute_tl_metric, leader_team_pairs


class Command(BaseCommand):
    help = 'Recompute TLApprovalMetric snapshots for team leaders.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--month',
            type=str,
            help='ISO date within the target month (default: current month).',
        )
        parser.add_argument(
            '--leader-id',
            type=int,
            help='Only recompute for this leader user ID.',
        )

    def handle(self, *args, **options):
        month_raw = options.get('month')
        if month_raw:
            try:
                month = date.fromisoformat(month_raw)
            except ValueError:
                raise CommandError('--month must be an ISO date (YYYY-MM-DD)')
        else:
            month = date.today()
        month = month.replace(day=1)

        leader_id = options.get('leader_id')
        pairs = leader_team_pairs()
        if leader_id:
            pairs = [(leader, team) for leader, team in pairs if leader.id == leader_id]

        if not pairs:
            self.stdout.write(self.style.WARNING('No (leader, team) pairs found.'))
            return

        computed = 0
        for leader, team in pairs:
            compute_tl_metric(leader, team, month)
            computed += 1
            self.stdout.write(f'  Computed: leader={leader.username} team={team.name} month={month}')

        self.stdout.write(self.style.SUCCESS(f'Done: {computed} snapshot(s) computed for {month}.'))
