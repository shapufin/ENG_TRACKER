"""TL scorecard summary export: XLSX (default) and PDF branches of one endpoint."""
import io
from datetime import date
from unittest import mock

from django.core.management import call_command
from django.test import SimpleTestCase, TestCase
from openpyxl import load_workbook
from pypdf import PdfReader
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.permissions.models import Role, UserRole
from core.utils.csv_injection_assert import PAYLOAD, assert_xlsx_neutralised

from . import services
from .excel_export import build_workbook_bytes
from .report_kpis import kpi_rows, status_for
from .models import Absence, PIPRecord
from .services import build_scorecard
from .test_tl_scorecard_hbpr import HbprScorecardBase
from .testing import make_user as _make_user
from .viewsets import TLScorecardViewSet

XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
SHEETS = ['Summary', 'Trend', 'Governance', 'HBPR partnership log']


def _assign_tl_role(user, code='italian_tl'):
    role, _ = Role.objects.get_or_create(code=code, defaults={'name': code})
    UserRole.objects.get_or_create(user=user, role=role, defaults={'is_active': True})


def _pdf_text(content):
    return ' '.join(page.extract_text() for page in PdfReader(io.BytesIO(content)).pages)


def _find_row(ws, label, column=2):
    for row in ws.iter_rows(min_row=1):
        if row[column - 1].value == label:
            return row
    raise AssertionError(f'{label!r} not found in {ws.title}')


class SummaryExportFormatTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        call_command('seed_plugin_permissions')
        self.leader = _make_user('leader_formats')
        _assign_tl_role(self.leader)
        self.member = _make_user('member_formats')
        self.member.profile.italian_tl = self.leader
        self.member.profile.save()
        PIPRecord.objects.create(employee=self.member, tl=self.leader, start_date=date.today())
        Absence.objects.create(employee=self.member, flagged_by=self.leader, absence_date=date.today())

    def _get(self, params=None):
        request = self.factory.get('/api/plugins/tl_scorecard/export/', params or {})
        force_authenticate(request, user=self.leader)
        return TLScorecardViewSet.as_view({'get': 'export'})(request)

    def test_pdf_branch_returns_a_pdf_attachment(self):
        resp = self._get({'file_format': 'pdf'})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp['Content-Type'], 'application/pdf')
        self.assertTrue(resp.content.startswith(b'%PDF'))
        month = date.today().strftime('%Y-%m')
        self.assertIn(
            f'attachment; filename="tl_scorecard_leader_formats_{month}.pdf"',
            resp['Content-Disposition'],
        )

    def test_xlsx_is_the_default_and_the_explicit_choice(self):
        for params in ({}, {'file_format': 'xlsx'}):
            with self.subTest(params=params):
                resp = self._get(params)
                self.assertEqual(resp.status_code, 200)
                self.assertEqual(resp['Content-Type'], XLSX_TYPE)
                self.assertEqual(resp.content[:2], b'PK')
                self.assertTrue(resp['Content-Disposition'].endswith('.xlsx"'))

    def test_workbook_sheets_and_numeric_one_to_one_summary(self):
        wb = load_workbook(io.BytesIO(self._get({'file_format': 'xlsx'}).content))
        self.assertEqual(wb.sheetnames, SHEETS)
        row = _find_row(wb['Summary'], '1:1 compliance')
        self.assertIsInstance(row[2].value, (int, float))
        self.assertNotIsInstance(row[2].value, bool)

    def test_summary_has_ot_within_sla_row(self):
        scorecard = build_scorecard(self.leader, date.today())
        governance = {'open_pips': [], 'pending_promotions': [], 'epr_cycles': [], 'open_absences': []}

        for pct, expected_status in [(100.0, 'On track'), (90.0, 'Watch'), (79.0, 'Off track')]:
            scorecard['overtime']['pct_within_sla'] = pct
            wb = load_workbook(io.BytesIO(build_workbook_bytes(scorecard, governance, 'Oct 2026')))
            ws = wb['Summary']
            row_turnaround = _find_row(ws, 'OT approval turnaround (days)')
            row_within = _find_row(ws, 'OT decided within 2 working days')
            self.assertEqual(row_turnaround[3].value, '—')
            self.assertEqual(row_turnaround[4].value, '—')
            self.assertEqual(row_within[0].row, row_turnaround[0].row + 1)
            self.assertEqual(row_within[2].value, pct)
            self.assertEqual(row_within[3].value, 100.0)
            self.assertEqual(row_within[4].value, expected_status)

    def test_summary_onboarding_row(self):
        scorecard = build_scorecard(self.leader, date.today())
        governance = {'open_pips': [], 'pending_promotions': [], 'epr_cycles': [], 'open_absences': []}

        # 1) When onboarding_pct is 100%: green at 100%
        scorecard['meetings']['onboarding_pct'] = 100.0
        scorecard['meetings']['onboarding_due'] = 2
        scorecard['meetings']['onboarding_done'] = 2
        wb = load_workbook(io.BytesIO(build_workbook_bytes(scorecard, governance, 'Oct 2026')))
        ws = wb['Summary']
        row_1on1 = _find_row(ws, '1:1 compliance')
        row_onb = _find_row(ws, 'Onboarding 1-on-1s within 14 days')
        self.assertEqual(row_onb[0].row, row_1on1[0].row + 1)
        self.assertEqual(row_onb[2].value, 100.0)
        self.assertEqual(row_onb[3].value, 100.0)
        self.assertEqual(row_onb[4].value, 'On track')

        # 2) With no joiners (onboarding_pct is None): — Value and Target
        scorecard['meetings']['onboarding_pct'] = None
        scorecard['meetings']['onboarding_due'] = 0
        scorecard['meetings']['onboarding_done'] = 0
        wb2 = load_workbook(io.BytesIO(build_workbook_bytes(scorecard, governance, 'Oct 2026')))
        ws2 = wb2['Summary']
        row_onb2 = _find_row(ws2, 'Onboarding 1-on-1s within 14 days')
        self.assertEqual(row_onb2[2].value, '—')
        self.assertEqual(row_onb2[3].value, '—')
        self.assertEqual(row_onb2[4].value, '—')

    def test_trend_sheet_has_onboarding_column_and_dash_when_no_joiners(self):
        resp = self._get({'file_format': 'xlsx'})
        self.assertEqual(resp.status_code, 200)
        wb = load_workbook(io.BytesIO(resp.content))
        ws = wb['Trend']
        rows = list(ws.iter_rows(values_only=True))
        header_idx, header_row = next(
            (i, r) for i, r in enumerate(rows) if r and r[0] == 'Month'
        )
        self.assertIn('Onboarding 1-on-1s', header_row)
        col_idx = header_row.index('Onboarding 1-on-1s')
        data_rows = [row for row in rows[header_idx + 1:] if row[0] is not None]
        self.assertTrue(len(data_rows) > 0)
        for row in data_rows:
            self.assertEqual(row[col_idx], '—')

    @mock.patch.object(services, 'ONBOARDING_TRACKING_START', date(2025, 1, 1))
    def test_governance_sheet_has_onboarding_section_with_met_and_missed_joiners(self):
        from .models import Meeting

        met_joiner = _make_user('joiner_met_fmt', first_name='Joiner', last_name='Met')
        met_joiner.profile.italian_tl = self.leader
        met_joiner.profile.hire_date = date(2026, 9, 20)  # due = 2026-10-04 (October)
        met_joiner.profile.save()

        missed_joiner = _make_user('joiner_missed_fmt', first_name='Joiner', last_name='Missed')
        missed_joiner.profile.italian_tl = self.leader
        missed_joiner.profile.hire_date = date(2026, 9, 25)  # due = 2026-10-09 (October)
        missed_joiner.profile.save()

        Meeting.objects.create(
            organizer=self.leader,
            counterparty=met_joiner,
            meeting_type='one_on_one',
            onboarding_discussed=True,
            occurred_on=date(2026, 10, 2),
        )

        resp = self._get({'file_format': 'xlsx', 'month': '2026-10-01'})
        self.assertEqual(resp.status_code, 200)
        wb = load_workbook(io.BytesIO(resp.content))
        ws = wb['Governance']

        rows = list(ws.iter_rows(values_only=True))
        onboarding_header_idx = None
        for i, row in enumerate(rows):
            if row and row[0] == 'Employee' and len(row) >= 3 and row[1] == 'Onboarding date' and row[2] == 'With':
                if i > 0 and rows[i - 1] and rows[i - 1][0] == 'Onboarding':
                    onboarding_header_idx = i
                    break

        self.assertIsNotNone(onboarding_header_idx, 'Onboarding section header not found in Governance sheet')
        data_rows = rows[onboarding_header_idx + 1:onboarding_header_idx + 3]
        met_row = next((r for r in data_rows if 'Joiner Met' in str(r[0])), None)
        missed_row = next((r for r in data_rows if 'Joiner Missed' in str(r[0])), None)
        self.assertIsNotNone(met_row, f'Joiner Met row not found in {data_rows}')
        self.assertIsNotNone(missed_row, f'Joiner Missed row not found in {data_rows}')

        self.assertEqual(met_row[1], '2026-10-02')
        self.assertEqual(met_row[2], self.leader.get_full_name() or self.leader.username)

        self.assertEqual(missed_row[1], '—')
        self.assertEqual(missed_row[2], '—')

    def test_pdf_export_contains_meetings_column_header_and_cover_phrase(self):
        resp = self._get({'file_format': 'pdf'})
        self.assertEqual(resp.status_code, 200)
        text = _pdf_text(resp.content)
        self.assertIn('onboarding 1-on-1s within 14 days', text)
        self.assertIn('Onboarding 1-on-1s', text)

    def test_unknown_file_format_is_rejected(self):
        resp = self._get({'file_format': 'docx'})
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data, {'error': 'file_format must be xlsx or pdf'})


class WorkbookFormulaSafetyTests(TestCase):
    """User-controlled text is stored as a literal, never a formula or link."""

    def _build(self, **evidence_fields):
        leader = _make_user('leader_formula_safety')
        evidence = [{
            'kind_display': 'Cadence', 'occurred_on': '2026-10-01', 'reporting_year': 2026,
            'shared_summary': '', 'action_items': '', 'reference_url': '', **evidence_fields,
        }]
        governance = {
            'open_pips': [], 'pending_promotions': [], 'epr_cycles': [],
            'open_absences': [{'employee': PAYLOAD, 'absence_date': '2026-10-01', 'reason': PAYLOAD}],
        }
        return build_workbook_bytes(
            build_scorecard(leader, date.today()), governance, 'Oct 2026', hbpr_evidence=evidence,
        )

    def test_partnership_log_shared_summary_is_neutralised(self):
        assert_xlsx_neutralised(self, self._build(shared_summary=PAYLOAD))

    def test_partnership_log_action_items_is_neutralised(self):
        assert_xlsx_neutralised(self, self._build(action_items=PAYLOAD))

    def test_partnership_log_reference_url_is_neutralised(self):
        assert_xlsx_neutralised(self, self._build(reference_url=PAYLOAD))

    def test_tab_leading_text_is_neutralised(self):
        wb = load_workbook(io.BytesIO(self._build(shared_summary='	=cmd')))
        values = [c for row in wb['HBPR partnership log'].iter_rows(values_only=True) for c in row]
        self.assertIn("'	=cmd", values)

    def test_governance_free_text_is_neutralised(self):
        assert_xlsx_neutralised(self, self._build())


class HbprExportFormatTests(HbprScorecardBase):
    """HBPR sees governance, never the leader's employee one-on-ones."""

    def setUp(self):
        super().setUp()
        from .models import Meeting

        second = _make_user('second_member_formats')
        second.profile.albanian_tl = self.tl
        second.profile.save()
        # One of two direct reports met 1:1 this month -> a real, non-trivial %.
        Meeting.objects.create(
            organizer=self.tl, counterparty=self.member, meeting_type='one_on_one',
            occurred_on=date.today(),
        )
        self.expected_pct = build_scorecard(self.tl, date.today())['meetings']['one_on_one_compliance_pct']
        self.assertEqual(self.expected_pct, 50.0)

    def _export(self, file_format):
        request = self.factory.get('/x/', {'leader_id': self.tl.id, 'file_format': file_format})
        force_authenticate(request, user=self.hbpr)
        return TLScorecardViewSet.as_view({'get': 'export'})(request)

    def test_xlsx_one_to_one_is_a_dash_in_summary_and_every_trend_row(self):
        resp = self._export('xlsx')
        self.assertEqual(resp.status_code, 200)
        wb = load_workbook(io.BytesIO(resp.content))
        self.assertEqual(_find_row(wb['Summary'], '1:1 compliance')[2].value, '—')

        trend = wb['Trend']
        rows = list(trend.iter_rows(values_only=True))
        header_idx, header = next(
            (i, r) for i, r in enumerate(rows) if r and '1:1 compliance' in r
        )
        column = header.index('1:1 compliance')
        data_rows = [row for row in rows[header_idx + 1:] if row[0] is not None]
        self.assertEqual(len(data_rows), 6)
        for row in data_rows:
            self.assertEqual(row[column], '—')
        # H2 guard: masked 1:1 compliance (col B) must never be plotted as a 0% series.
        refs = [
            getattr(getattr(s.val, 'numRef', None), 'f', '')
            for c in trend._charts
            for s in c.series
        ]
        self.assertFalse(any('!$B$' in f for f in refs), f'Masked col B plotted: {refs}')

    def test_pdf_never_contains_the_leaders_one_to_one_percentage(self):
        resp = self._export('pdf')
        self.assertEqual(resp.status_code, 200)
        text = _pdf_text(resp.content)
        self.assertIn('Meetings & reviews', text)
        self.assertNotIn(f'{self.expected_pct}%', text)

    def test_governance_is_limited_to_hbpr_scoped_subjects(self):
        ex_member = _make_user('ex_member_formats', first_name='Former', last_name='Colleague')
        PIPRecord.objects.create(employee=ex_member, tl=self.tl, start_date=date.today())
        PIPRecord.objects.create(employee=self.member, tl=self.tl, start_date=date.today())

        wb = load_workbook(io.BytesIO(self._export('xlsx').content))
        governance_text = ' '.join(
            str(cell) for row in wb['Governance'].iter_rows(values_only=True) for cell in row if cell
        )
        self.assertNotIn('ex_member_formats', governance_text)
        self.assertIn(self.member.username, governance_text)

        pdf_text = _pdf_text(self._export('pdf').content)
        self.assertNotIn('ex_member_formats', pdf_text)
        self.assertIn(self.member.username, pdf_text)

    def test_hbpr_export_has_no_onboarding_text_anywhere(self):
        for fmt in ('xlsx', 'pdf'):
            resp = self._export(fmt)
            self.assertEqual(resp.status_code, 200)
            if fmt == 'xlsx':
                wb = load_workbook(io.BytesIO(resp.content))
                for name in wb.sheetnames:
                    for row in wb[name].iter_rows(values_only=True):
                        for cell in row:
                            if cell:
                                self.assertNotIn('onboarding', str(cell).lower())
            else:
                text = _pdf_text(resp.content)
                self.assertNotIn('onboarding', text.lower())


class ReportKpiStatusTests(SimpleTestCase):
    def test_higher_is_better_targets(self):
        self.assertEqual(status_for(100.0, 100.0), 'On track')
        self.assertEqual(status_for(85.0, 100.0), 'Watch')
        self.assertEqual(status_for(50.0, 100.0), 'Off track')
        self.assertEqual(status_for(None, 100.0), '—')

    def test_zero_targets_follow_the_ui_tone_of_a_breach(self):
        self.assertEqual(status_for(0, 0, nonzero='Watch'), 'On track')
        self.assertEqual(status_for(1, 0, nonzero='Watch'), 'Watch')
        self.assertEqual(status_for(2, 0, nonzero='Off track'), 'Off track')

    def test_review_target_is_pro_rata_to_the_month(self):
        rows = kpi_rows({
            'month': '2026-06-01', 'team_size': 1,
            'review_deliveries_ytd': 6,
            'leave': {'pct_within_2_days': None, 'pending_at_month_end': 0},
            'overtime': {'avg_turnaround_days': None},
            'meetings': {'one_on_one_compliance_pct': None, 'tl_sync_count': 0,
                         'team_meetings_with_hrbp': 0},
            'idle': {'open_count': 0}, 'absences': {'breached_5_day_sla': 0},
            'pip': {'pending_approval_count': 0}, 'promotion': {'promoted_pct': None},
            'escalation_count': 0,
        })
        reviews = next(r for r in rows if r['metric'].startswith('Management reviews'))
        self.assertEqual(reviews['target'], 6)
        self.assertEqual(reviews['status'], 'On track')

    def test_export_targets_come_from_the_viewers_scorecard(self):
        role_targets = {'tl_sync_per_year': 24, 'reviews_per_year': 4, 'one_on_one_pct': 80.0, 'promotion_pct': 2.0}
        rows = kpi_rows({
            'month': '2026-06-01', 'team_size': 1, 'targets': role_targets,
            'review_deliveries_ytd': 2,
            'leave': {'pct_within_2_days': None, 'pending_at_month_end': 0},
            'overtime': {'avg_turnaround_days': None},
            'meetings': {'one_on_one_compliance_pct': None, 'tl_sync_count': 0,
                         'team_meetings_with_hrbp': 0},
            'idle': {'open_count': 0}, 'absences': {'breached_5_day_sla': 0},
            'pip': {'pending_approval_count': 0}, 'promotion': {'promoted_pct': None},
            'escalation_count': 0,
        })
        reviews = next(r for r in rows if r['metric'].startswith('Management reviews'))
        self.assertEqual(reviews['target'], 2)  # 4 a year, pro-rata to June
        one_on_one = next(r for r in rows if r['metric'].startswith('1:1'))
        self.assertEqual(one_on_one['target'], 80.0)


class EprEvidenceExportTests(HbprScorecardBase):
    """Stage dates, who recorded them and HBPR attendance are exported; review
    content (summary, link) only to the leader and staff, never to the HBPR."""

    def setUp(self):
        super().setUp()
        from django.utils import timezone
        from .models import EPRCycle, EPRGoal, EPRStageRecord

        self.cycle, _ = EPRCycle.objects.get_or_create(user=self.member, year=date.today().year)
        EPRCycle.objects.filter(pk=self.cycle.pk).update(
            goal_setting_completed_at=timezone.now(), mid_year_completed_at=timezone.now())
        EPRGoal.objects.create(cycle=self.cycle, description='Reduce backlog')
        EPRStageRecord.objects.create(
            cycle=self.cycle, stage='mid_year', summary='Private review notes',
            reference_url='https://workday.example/x', recorded_by=self.tl, hbpr_present=True)

    def _sheet_text(self, user, leader=True):
        params = {'file_format': 'xlsx'}
        if leader:
            params['leader_id'] = self.tl.id
        request = self.factory.get('/x/', params)
        force_authenticate(request, user=user)
        resp = TLScorecardViewSet.as_view({'get': 'export'})(request)
        self.assertEqual(resp.status_code, 200)
        wb = load_workbook(io.BytesIO(resp.content))
        return ' | '.join(
            str(c) for row in wb['Governance'].iter_rows(values_only=True) for c in row if c)

    def test_leader_export_has_dates_attendance_goals_and_review_content(self):
        text = self._sheet_text(self.tl, leader=False)
        today = date.today().isoformat()
        self.assertIn(today, text)  # stage completion date, not just "Done"
        self.assertIn('Reduce backlog', text)
        self.assertIn('Private review notes', text)
        self.assertIn('https://workday.example/x', text)
        self.assertIn('HBPR present', text)

    def test_hbpr_export_never_contains_review_content(self):
        text = self._sheet_text(self.hbpr)
        self.assertIn(date.today().isoformat(), text)
        self.assertIn('HBPR present', text)
        self.assertNotIn('Private review notes', text)
        self.assertNotIn('https://workday.example/x', text)


class PipSharedNotesAndPdfEvidenceTests(HbprScorecardBase):
    """Decisions D3 and D6: shared PIP notes reach every export (the HBPR can
    already read them in-app); private PIP notes never do. The PDF prints the
    full stage summary and goal titles for the leader and staff only."""

    def setUp(self):
        super().setUp()
        from django.utils import timezone
        from .models import EPRCycle, EPRGoal, EPRStageRecord

        PIPRecord.objects.create(
            employee=self.member, tl=self.tl, start_date=date.today(),
            shared_notes='Shared target: close two tickets a week',
            notes='Private PIP evidence',
        )
        self.cycle, _ = EPRCycle.objects.get_or_create(user=self.member, year=date.today().year)
        EPRCycle.objects.filter(pk=self.cycle.pk).update(goal_setting_completed_at=timezone.now())
        EPRGoal.objects.create(cycle=self.cycle, description='Reduce backlog')
        EPRStageRecord.objects.create(
            cycle=self.cycle, stage='mid_year', summary='Agreed review summary text',
            recorded_by=self.tl, hbpr_present=True)

    def _export(self, user, file_format):
        request = self.factory.get('/x/', {'leader_id': self.tl.id, 'file_format': file_format})
        force_authenticate(request, user=user)
        return TLScorecardViewSet.as_view({'get': 'export'})(request)

    def test_shared_pip_notes_reach_leader_and_hbpr_xlsx_but_private_notes_never(self):
        for user in (self.tl, self.hbpr):
            wb = load_workbook(io.BytesIO(self._export(user, 'xlsx').content))
            text = ' '.join(
                str(c) for row in wb['Governance'].iter_rows(values_only=True) for c in row if c)
            self.assertIn('Shared target: close two tickets a week', text)
            self.assertNotIn('Private PIP evidence', text)

    def test_leader_pdf_prints_full_stage_summary_and_goal_titles(self):
        # The summary wraps inside its cell, so compare on whitespace-normalised text.
        text = ' '.join(_pdf_text(self._export(self.tl, 'pdf').content).split())
        self.assertIn('Agreed review summary text', text)
        self.assertIn('Reduce backlog', text)
        self.assertIn('Shared target', text)

    def test_hbpr_pdf_never_prints_stage_summary_or_private_notes(self):
        text = _pdf_text(self._export(self.hbpr, 'pdf').content)
        self.assertNotIn('Agreed review summary text', text)
        self.assertNotIn('Private PIP evidence', text)

    def test_xlsx_export_includes_epr_summary_and_two_trend_charts(self):
        wb = load_workbook(io.BytesIO(self._export(self.tl, 'xlsx').content))
        self.assertEqual(wb.sheetnames, ['Summary', 'Trend', 'Governance', 'HBPR partnership log'])
        summary_text = ' '.join(
            str(c) for row in wb['Summary'].iter_rows(values_only=True) for c in row if c
        )
        self.assertIn('EPR progress', summary_text)
        self.assertIn('Goal setting', summary_text)
        trend_ws = wb['Trend']
        self.assertEqual(len(trend_ws._charts), 2)
        headers = [cell.value for cell in trend_ws[4]]
        self.assertIn('Team meetings held', headers)
        self.assertIn('Pro-rata target', headers)

    def test_pdf_export_contains_redesigned_chart_titles(self):
        text = ' '.join(_pdf_text(self._export(self.tl, 'pdf').content).split())
        self.assertIn('Monthly Meeting Cadence', text)
        self.assertIn('Management Reviews (YTD) vs Pro-rata Target', text)
        self.assertIn('Seniority Mix', text)
