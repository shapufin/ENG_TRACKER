"""
Purge archived teams that are past retention, and expired detached calendar workspaces.

Usage:
    python manage.py purge_archived_teams --dry-run
    python manage.py purge_archived_teams

A team is purged only when `team_lifecycle.purge_blockers` is empty: archived for 365 days,
no team activity in that time, nothing depending on it, and the year it was archived in is
closed (year close). Deletion is opt-in: never run at boot, only from cron or by hand
(docs/workflow-invariants.md item 17). Metric history survives with its team labels.
"""
from django.core.management.base import BaseCommand

from apps.dashboard.services.workspace_retention import purge_detached_workspaces
from apps.users.models import Team
from apps.users.services import team_lifecycle


class Command(BaseCommand):
    help = 'Purge archived teams past retention and expired detached calendar workspaces.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Only report what would be purged.')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        teams = 0
        for team in Team.objects.filter(is_active=False).order_by('pk'):
            if team_lifecycle.purge_blockers(team):
                continue
            teams += 1
            self.stdout.write(f'  {"Would purge" if dry_run else "Purging"} team {team.code} ({team.name})')
            if not dry_run:
                team_lifecycle.purge_team(team, None)
        workspaces = purge_detached_workspaces(dry_run=dry_run)
        verb = 'Would purge' if dry_run else 'Purged'
        self.stdout.write(self.style.SUCCESS(
            f'{verb} {teams} team(s) and {workspaces} detached workspace(s).'
        ))
