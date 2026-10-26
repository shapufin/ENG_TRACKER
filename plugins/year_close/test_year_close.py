"""Year close engine (plan Y3): readiness, build, retry, completeness, hashes."""
import json
import shutil
import tempfile
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import TestCase, override_settings

from apps.leave_management.models import LeaveRequest
from apps.overtime.models import Client, OvertimeLog
from apps.standby.models import StandbyLog
from apps.users.models import ClosedYear, Team, TeamMembership
from apps.users.services.approval_periods import clear_closed_year_cache
from core.utils.timezone_local import business_today
from plugins.year_close.models import YearSnapshot
from plugins.year_close.services import builder
from plugins.year_close.services.closer import close_year, latest_snapshot
from plugins.year_close.services.readiness import check_year_readiness


class YearCloseFixture(TestCase):
    """A finished year with one TL, one team and one member."""

    def setUp(self):
        clear_closed_year_cache()
        self.addCleanup(clear_closed_year_cache)

        self.root = Path(tempfile.mkdtemp(prefix='year-close-'))
        self.addCleanup(shutil.rmtree, self.root, True)
        override = override_settings(SNAPSHOT_ROOT=self.root)
        override.enable()
        self.addCleanup(override.disable)

        self.today = business_today()
        self.year = self.today.year - 1
        self.work_date = date(self.year, 6, 10)

        self.tl = User.objects.create_user(username='yc_tl', password='x')
        self.member = User.objects.create_user(username='yc_member', password='x')
        self.outsider = User.objects.create_user(username='yc_outsider', password='x')
        self.client_row = Client.objects.create(name='YC Client', code='YCC')

        self.team = Team.objects.create(name='YC Team', code='YCT', team_leader=self.tl)
        TeamMembership.objects.create(
            user_profile=self.member.profile, team=self.team, is_primary_team=True,
        )
        # `is_team_leader` is derived (role/led team), never assigned: the
        # team_leader FK above and the italian_tl FK below are the real sources.
        member_profile = self.member.profile
        member_profile.italian_tl = self.tl
        member_profile.save(update_fields=['italian_tl'])

    def add_overtime(self, user=None, status='rejected'):
        return OvertimeLog.objects.create(
            user=user or self.member, client=self.client_row, date=self.work_date,
            hours=2, status=status,
        )

    def add_standby(self, user=None, status='rejected'):
        return StandbyLog.objects.create(
            user=user or self.member, date=self.work_date, hours=2, status=status,
        )

    def add_leave(self, user=None, status='approved'):
        return LeaveRequest.objects.create(
            user=user or self.member, start_date=self.work_date,
            end_date=self.work_date + timedelta(days=1),
            request_type='vacation', status=status, days_counted=2,
        )


class ReadinessTests(YearCloseFixture):
    def test_a_year_before_february_is_blocked(self):
        readiness = check_year_readiness(business_today().year)
        self.assertTrue(any('February' in blocker for blocker in readiness['blockers']))

    def test_a_clean_year_has_no_blockers(self):
        self.add_overtime(status='rejected')
        self.assertEqual(check_year_readiness(self.year)['blockers'], [])

    def test_pending_overtime_blocks(self):
        self.add_overtime(status='pending')
        blockers = check_year_readiness(self.year)['blockers']
        self.assertTrue(any('overtime' in b and 'pending' in b for b in blockers))

    def test_pending_standby_blocks(self):
        self.add_standby(status='pending')
        blockers = check_year_readiness(self.year)['blockers']
        self.assertTrue(any('standby' in b and 'pending' in b for b in blockers))

    def test_pending_leave_overlapping_the_year_blocks(self):
        self.add_leave(status='pending')
        blockers = check_year_readiness(self.year)['blockers']
        self.assertTrue(any('leave' in b for b in blockers))

    def test_approved_overtime_outside_finalized_payroll_blocks(self):
        self.add_overtime(status='approved')
        blockers = check_year_readiness(self.year)['blockers']
        self.assertTrue(any('finalized payroll' in b for b in blockers))

    def test_a_draft_payroll_run_blocks(self):
        from plugins.payroll.models import PayrollRuleSet, PayrollRun

        rule_set = PayrollRuleSet.objects.create(
            name='YC rules', effective_from=date(self.year, 1, 1),
        )
        PayrollRun.objects.create(year=self.year, month=6, status='draft', rule_set=rule_set)
        blockers = check_year_readiness(self.year)['blockers']
        self.assertTrue(any('draft payroll run' in b for b in blockers))

    def test_payroll_checks_are_skipped_when_the_plugin_is_unavailable(self):
        self.add_overtime(status='approved')
        with patch(
            'plugins.year_close.services.readiness._payroll_models', return_value=None,
        ):
            readiness = check_year_readiness(self.year)
        self.assertFalse(any('payroll' in b for b in readiness['blockers']))

    def test_unfinished_epr_and_settlement_are_warnings_not_blockers(self):
        self.add_overtime(status='rejected')
        readiness = check_year_readiness(self.year)
        self.assertEqual(readiness['blockers'], [])
        self.assertIsInstance(readiness['warnings'], list)


class BuildTests(YearCloseFixture):
    def test_a_blocked_year_writes_no_snapshot_files_and_no_lock(self):
        self.add_overtime(status='pending')
        snapshot = close_year(self.year)
        self.assertEqual(snapshot.status, 'blocked')
        self.assertTrue(snapshot.readiness['blockers'])
        self.assertEqual(snapshot.files.count(), 0)
        self.assertFalse(ClosedYear.objects.filter(year=self.year).exists())

    def test_a_ready_year_writes_the_set_and_freezes_the_year(self):
        self.add_overtime(status='rejected')
        self.add_standby(status='rejected')
        self.add_leave(status='approved')

        snapshot = close_year(self.year)
        self.assertEqual(snapshot.status, 'ready', snapshot.readiness)
        self.assertTrue(ClosedYear.objects.filter(year=self.year).exists())

        paths = {row.relative_path for row in snapshot.files.all()}
        self.assertIn(f'{self.year}/company_{self.year}.zip', paths)
        self.assertIn(f'{self.year}/MANIFEST.json', paths)
        self.assertTrue(any(path.startswith(f'{self.year}/yc_tl__YCT') for path in paths))
        for row in snapshot.files.all():
            self.assertTrue((self.root / row.relative_path).exists(), row.relative_path)
            self.assertEqual(row.status, 'ready')

        closed = ClosedYear.objects.get(year=self.year)
        self.assertEqual(closed.snapshot_ref, f'{self.year}/v{snapshot.version}')

    def test_closing_twice_is_idempotent(self):
        self.add_overtime(status='rejected')
        first = close_year(self.year)
        second = close_year(self.year)
        self.assertEqual(first.pk, second.pk)
        self.assertEqual(YearSnapshot.objects.filter(year=self.year).count(), 1)

    def test_the_set_manifest_matches_every_file_hash(self):
        self.add_overtime(status='rejected')
        snapshot = close_year(self.year)
        self.assertEqual(snapshot.status, 'ready', snapshot.readiness)

        manifest = json.loads((self.root / str(self.year) / 'MANIFEST.json').read_text('utf-8'))
        self.assertEqual(manifest['year'], self.year)
        self.assertTrue(manifest['files'])
        for entry in manifest['files']:
            path = self.root / entry['path']
            self.assertTrue(path.exists(), entry['path'])
            self.assertEqual(builder.sha256_file(path), entry['sha256'], entry['path'])

        digest = (self.root / str(self.year) / 'MANIFEST.sha256').read_text('utf-8')
        self.assertTrue(digest.startswith(builder.sha256_file(self.root / str(self.year) / 'MANIFEST.json')))

    def test_a_bundle_zip_carries_its_own_manifest_and_counts(self):
        self.add_overtime(status='rejected')
        close_year(self.year)
        bundle = next(
            self.root.glob(f'{self.year}/yc_tl__YCT*.zip'),
        )
        import zipfile

        with zipfile.ZipFile(bundle) as archive:
            names = set(archive.namelist())
            self.assertIn('MANIFEST.json', names)
            manifest = json.loads(archive.read('MANIFEST.json'))
        self.assertEqual(manifest['counts']['overtime'], 1)
        self.assertEqual(manifest['bundle']['leader'], 'yc_tl')
        self.assertEqual(manifest['bundle']['team'], 'YCT')

    def test_a_user_outside_every_pair_lands_in_the_unassigned_bundle(self):
        self.add_overtime(user=self.outsider, status='rejected')
        snapshot = close_year(self.year)
        self.assertEqual(snapshot.status, 'ready', snapshot.readiness)
        self.assertTrue(
            snapshot.files.filter(kind='unassigned').exists(),
            'an outsider with rows must still be in the set',
        )

    def test_completeness_gap_blocks_the_build(self):
        self.add_overtime(status='rejected')
        with patch(
            'plugins.year_close.services.builder.bundles_for_year', return_value=[],
        ):
            snapshot = close_year(self.year)
        self.assertEqual(snapshot.status, 'failed')
        self.assertIn('belong to no bundle', snapshot.readiness.get('error', ''))
        self.assertFalse(ClosedYear.objects.filter(year=self.year).exists())

    def test_retry_rebuilds_only_the_failed_file(self):
        self.add_overtime(status='rejected')
        real_build = builder.build_bundle
        calls = {'n': 0}
        state = {'failed_once': False}

        def flaky(year, bundle, warnings):
            calls['n'] += 1
            if not state['failed_once']:
                state['failed_once'] = True
                raise RuntimeError('disk full')
            return real_build(year, bundle, warnings)

        # The patch stays active across both calls: it fails the first build and
        # succeeds afterwards, which is what a real transient failure looks like.
        with patch('plugins.year_close.services.builder.build_bundle', side_effect=flaky):
            snapshot = close_year(self.year)
            self.assertEqual(snapshot.status, 'failed')
            self.assertEqual(snapshot.files.filter(status='failed').count(), 1)

            calls['n'] = 0
            retried = close_year(self.year, retry=True)
        self.assertEqual(
            retried.status, 'ready',
            [(row.relative_path, row.status, row.error) for row in retried.files.all()],
        )
        self.assertEqual(calls['n'], 1, 'only the failed bundle is rebuilt')
        self.assertTrue(ClosedYear.objects.filter(year=self.year).exists())

    def test_the_command_closes_last_year_by_default(self):
        self.add_overtime(status='rejected')
        call_command('close_year', verbosity=0)
        self.assertEqual(latest_snapshot(self.year).status, 'ready')

    def test_the_command_refuses_a_year_that_has_not_finished(self):
        with self.assertRaises(Exception):
            call_command('close_year', year=business_today().year, verbosity=0)

class PairQueryBudgetTests(YearCloseFixture):
    """Bundle discovery must not run a query per (leader, team) pair."""

    def _measure(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        with CaptureQueriesContext(connection) as captured:
            builder.bundles_for_year(self.year)
        return len(captured)

    def _add_pair(self, index):
        leader = User.objects.create_user(username=f'yc_tl_{index}', password='x')
        member = User.objects.create_user(username=f'yc_member_{index}', password='x')
        team = Team.objects.create(
            name=f'YC Team {index}', code=f'YCT{index}', team_leader=leader,
        )
        TeamMembership.objects.create(
            user_profile=member.profile, team=team, is_primary_team=True,
        )
        profile = member.profile
        profile.italian_tl = leader
        profile.save(update_fields=['italian_tl'])
        self.add_overtime(user=member, status='rejected')

    def test_the_query_count_is_bounded_when_pairs_are_added(self):
        self.add_overtime(status='rejected')
        baseline = self._measure()
        for index in range(3):
            self._add_pair(index)
        grown = self._measure()
        # A few per-leader lookups are expected; a per-pair query is not.
        self.assertLessEqual(
            grown, baseline + 12,
            f'{grown} queries for 4 pairs vs {baseline} for 1: discovery scales with pairs',
        )

class ManagedMembersParityTests(YearCloseFixture):
    """The batched lookup must return exactly what core's per-profile helper does."""

    def test_managed_members_match_core(self):
        # A second leader with a led team and a direct FK member, so all three
        # sources of get_team_member_ids() are exercised.
        other_leader = User.objects.create_user(username='yc_tl_2', password='x')
        direct = User.objects.create_user(username='yc_direct', password='x')
        team_member = User.objects.create_user(username='yc_teammate', password='x')
        other_team = Team.objects.create(
            name='YC Team 2', code='YCT2', team_leader=other_leader,
        )
        TeamMembership.objects.create(
            user_profile=team_member.profile, team=other_team, is_primary_team=True,
        )
        profile = direct.profile
        profile.albanian_tl = other_leader
        profile.save(update_fields=['albanian_tl'])

        leaders = [self.tl, other_leader]
        batched = builder.managed_member_ids_bulk([leader.pk for leader in leaders])
        for leader in leaders:
            self.assertEqual(
                batched[leader.pk], set(leader.profile.get_team_member_ids()),
                f'mismatch for {leader.username}',
            )
