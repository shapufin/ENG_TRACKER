"""Team lifecycle plan, Phase 7: purge_archived_teams and the closed-year rule."""
from datetime import date, timedelta
from io import StringIO
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import RequestFactory, TestCase
from django.utils import timezone

from apps.dashboard.models.calendar import CalendarWorkspace
from apps.reports.models import AuditLog
from apps.users.models import ClosedYear, Team
from apps.users.services import team_lifecycle
from apps.users.services.approval_periods import clear_closed_year_cache


class PurgeArchivedTeamsTests(TestCase):
    def setUp(self):
        clear_closed_year_cache()
        self.addCleanup(clear_closed_year_cache)
        self.admin = User.objects.create_user('adm', password='x', is_staff=True)
        request = RequestFactory().post('/x')
        request.user = self.admin
        self.old = Team.objects.create(name='Old', code='OLD')
        self.recent = Team.objects.create(name='Recent', code='REC')
        for team in (self.old, self.recent):
            team_lifecycle.archive_team(team, request)
        long_ago = timezone.now() - timedelta(days=400)
        Team.objects.filter(pk=self.old.pk).update(archived_at=long_ago)
        self.old.refresh_from_db()
        # the history/membership stamps also count as activity: age them with the team
        self.addCleanup(clear_closed_year_cache)

    def close_year_of(self, team):
        ClosedYear.objects.create(year=team.archived_at.year, closed_at=timezone.now())
        clear_closed_year_cache()

    def run_command(self, *args):
        out = StringIO()
        call_command('purge_archived_teams', *args, stdout=out)
        return out.getvalue()

    def test_an_archive_year_that_is_not_closed_blocks_the_purge(self):
        with patch('apps.users.services.team_lifecycle._year_close_engine_enabled', return_value=True):
            blockers = team_lifecycle.purge_blockers(self.old)
        self.assertTrue(any('year' in b and 'closed' in b for b in blockers), blockers)

    def test_without_the_year_close_engine_a_finished_year_does_not_block(self):
        with patch('apps.users.services.team_lifecycle._year_close_engine_enabled', return_value=False), \
                patch('apps.users.services.team_lifecycle.business_today', return_value=date(2026, 10, 27)):
            self.assertEqual(team_lifecycle.purge_blockers(self.old), [])

    def test_without_the_year_close_engine_an_unfinished_year_still_blocks(self):
        with patch('apps.users.services.team_lifecycle._year_close_engine_enabled', return_value=False):
            blockers = team_lifecycle.purge_blockers(self.recent)  # archived this year
        self.assertTrue(any('not ended' in b for b in blockers), blockers)

    def test_a_blocked_team_is_reported_with_its_reasons(self):
        out = self.run_command('--dry-run')
        self.assertIn('Skip REC', out)
        self.assertIn('archived less than 365 days ago', out)
        self.assertIn('1 archived team(s) skipped', out)

    def test_closing_that_year_clears_the_blocker(self):
        self.close_year_of(self.old)
        self.assertEqual(team_lifecycle.purge_blockers(self.old), [])

    def test_dry_run_changes_nothing_and_reports(self):
        self.close_year_of(self.old)
        out = self.run_command('--dry-run')
        self.assertIn('Would purge 1 team', out)
        self.assertTrue(Team.objects.filter(pk=self.old.pk).exists())

    def test_command_purges_only_eligible_teams_and_audits(self):
        self.close_year_of(self.old)
        out = self.run_command()
        self.assertIn('Purged 1 team', out)
        self.assertFalse(Team.objects.filter(pk=self.old.pk).exists())
        self.assertTrue(Team.objects.filter(pk=self.recent.pk).exists())  # archived less than 365 days ago
        self.assertTrue(AuditLog.objects.filter(model_name='team', extra_data__operation='purge').exists())

    def test_command_also_purges_expired_detached_workspaces(self):
        self.close_year_of(self.old)
        workspace = CalendarWorkspace.objects.get(team=self.old)
        self.run_command()
        workspace.refresh_from_db()
        self.assertIsNone(workspace.team_id)  # detached by the team delete, kept for a year
        CalendarWorkspace.objects.filter(pk=workspace.pk).update(detached_at=timezone.now() - timedelta(days=400))
        out = self.run_command()
        self.assertIn('and 1 detached workspace', out)
        self.assertFalse(CalendarWorkspace.objects.filter(pk=workspace.pk).exists())

    def test_running_twice_is_a_no_op(self):
        self.close_year_of(self.old)
        self.run_command()
        self.assertIn('Purged 0 team', self.run_command())
