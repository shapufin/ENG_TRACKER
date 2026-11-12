"""The year-close set also carries the scorecard, EPR, engagement and evidence of the year."""
import io
import zipfile
from datetime import date
from unittest.mock import patch

from django.contrib.auth.models import User
from django.utils import timezone
from openpyxl import load_workbook

from apps.users.models import HbprAlbanianTlAssignment
from plugins.engagement.models import TLApprovalMetric
from plugins.tl_scorecard.models import (
    EPRCycle, EPRStageRecord, HbprGovernanceEvidence, IdleFlag, ScorecardMonthSnapshot,
)
from plugins.year_close.services import archive_sets  # noqa: F401  bind before any patch
from plugins.year_close.services.closer import close_year
from plugins.year_close.services.readiness import check_year_readiness
from plugins.year_close.test_year_close import YearCloseFixture


class ArchiveSetsTests(YearCloseFixture):
    def setUp(self):
        super().setUp()
        self.hbpr = User.objects.create_user(username='yc_hbpr', password='x')
        self.assignment = HbprAlbanianTlAssignment.objects.create(
            hbpr=self.hbpr, albanian_tl=self.tl, cadence='weekly', effective_from=date(2020, 1, 1))
        cycle = EPRCycle.objects.create(
            user=self.member, year=self.year, mid_year_completed_at=timezone.now())
        EPRStageRecord.objects.create(
            cycle=cycle, stage='mid_year', summary='=cmd|evil', recorded_by=self.tl,
            hbpr_present=True, shared_with_employee=True)
        for month in (3, 12):
            ScorecardMonthSnapshot.objects.create(
                leader=self.tl, month=date(self.year, month, 1), member_ids=[self.member.id],
                payload={'x': month}, computed_at=timezone.now())
        TLApprovalMetric.objects.create(
            leader=self.tl, team=self.team, month=date(self.year, 3, 1), team_size=1,
            computed_at=timezone.now())
        HbprGovernanceEvidence.objects.create(
            assignment=self.assignment, kind='epr_mid_year', reporting_year=self.year,
            occurred_on=date(self.year, 7, 1), recorded_by=self.tl)
        IdleFlag.objects.create(
            employee=self.member, flagged_by=self.tl, flagged_on=date(self.year, 5, 5))

    def _company(self, snapshot):
        path = self.root / f'{self.year}/company_{self.year}.zip'
        self.assertTrue(path.exists(), snapshot.readiness)
        return zipfile.ZipFile(path)

    def _sheets(self, archive, name):
        workbook = load_workbook(io.BytesIO(archive.read(name)))
        return {ws.title: [[c for c in row] for row in ws.iter_rows(values_only=True)]
                for ws in workbook.worksheets}

    def test_company_zip_carries_epr_and_leader_history(self):
        snapshot = close_year(self.year)
        self.assertEqual(snapshot.status, 'ready', snapshot.readiness)
        with self._company(snapshot) as archive:
            self.assertIn('scorecard/epr.xlsx', archive.namelist())
            self.assertIn('scorecard/leaders.xlsx', archive.namelist())
            epr = self._sheets(archive, 'scorecard/epr.xlsx')
            leaders = self._sheets(archive, 'scorecard/leaders.xlsx')
            manifest = __import__('json').loads(archive.read('MANIFEST.json'))
        flat = str(epr)
        self.assertIn('yc_member', flat)
        summaries = [row[-1] for row in epr['Stage records'][1:]]
        self.assertEqual(summaries, ["'=cmd|evil"])  # neutralised, never a live formula
        self.assertEqual(len(leaders['Scorecard months']) - 1, 2)
        self.assertEqual(len(leaders['Engagement months']) - 1, 1)
        self.assertIn('yc_member', str(leaders['Governance evidence']))  # attended employee
        self.assertIn('yc_member', str(leaders['Leader records']))
        self.assertEqual(manifest['counts']['epr_cycles'], 1)
        self.assertEqual(manifest['counts']['scorecard_months'], 2)

    def test_a_missing_december_snapshot_blocks_the_close(self):
        ScorecardMonthSnapshot.objects.filter(month=date(self.year, 12, 1)).delete()
        readiness = check_year_readiness(self.year)
        self.assertTrue(any('December' in b for b in readiness['blockers']), readiness)
        self.assertEqual(close_year(self.year).status, 'blocked')

    def test_a_year_without_scorecard_data_still_closes(self):
        ScorecardMonthSnapshot.objects.all().delete()
        snapshot = close_year(self.year)
        self.assertEqual(snapshot.status, 'ready', snapshot.readiness)

    def test_a_disabled_scorecard_plugin_adds_nothing_and_blocks_nothing(self):
        with patch('plugins.year_close.services.readiness.plugin_available', return_value=False), \
                patch('plugins.year_close.services.archive_sets.plugin_available', return_value=False):
            snapshot = close_year(self.year)
            self.assertEqual(snapshot.status, 'ready', snapshot.readiness)
            with self._company(snapshot) as archive:
                self.assertNotIn('scorecard/epr.xlsx', archive.namelist())
