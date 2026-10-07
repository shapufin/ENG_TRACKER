"""Workday goal-setting PDF preview extraction and lifecycle scoping."""
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from pypdf import PdfWriter
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.permissions.models import Role, UserRole

from .epr_goal_import import (
    GoalImportError,
    MAX_UPLOAD_BYTES,
    TITLE_MAX_CHARS,
    extract_goal_titles,
    normalize_goal_titles,
)
from .models import EPRCycle, EPRGoal, EPRStageRecord
from .testing import make_user as _make_user
from .viewsets import EPRCycleViewSet


EXPECTED_TITLES = [
    'Backlog Reduction',
    'AI Adoption',
    'Ticket Bounce/Reassignment Rate',
    'Microsoft High-Severity Incident Prevention',
    'Performance and Quality of Operational Activities',
]


def _assign_tl_role(user):
    role, _ = Role.objects.get_or_create(code='italian_tl', defaults={'name': 'italian_tl'})
    UserRole.objects.get_or_create(user=user, role=role, defaults={'is_active': True})


def _workday_pdf(titles=EXPECTED_TITLES):
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=letter)
    y = 750
    pdf.drawString(72, y, 'Employee Name')
    y -= 30
    pdf.drawString(72, y, 'Manager: Test Manager')
    y -= 45
    pdf.drawString(72, y, 'Goals')
    for index, title in enumerate(titles, start=1):
        y -= 45
        pdf.drawString(100, y, title)
        y -= 30
        pdf.drawString(100, y, f'Description for goal {index}.')
        y -= 25
        pdf.drawString(100, y, 'Due Date: 31/12/2026')
        y -= 25
        pdf.drawString(100, y, 'Category: Performance Objective')
        y -= 25
        pdf.drawString(100, y, 'Organization Alignment: Team')
        y -= 25
        pdf.drawString(100, y, f'Weight: {index * 10}')
    pdf.save()
    return buffer.getvalue()


def _pdf_upload(name='workday-goals.pdf', content=None):
    return SimpleUploadedFile(name, content if content is not None else _workday_pdf())


def _pdf_with_lines(lines):
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=letter)
    y = 750
    for line in lines:
        pdf.drawString(72, y, line)
        y -= 25
    pdf.save()
    return buffer.getvalue()


class ExtractGoalTitlesTests(TestCase):
    def test_extracts_titles_from_weight_bounded_blocks(self):
        text = '''
Goals

Backlog Reduction
Percentage of aged tickets closed.
Due Date: 31/12/2026
Category: Performance Objective
Weight: 25

AI Adoption
Automation target.
Weight: 20
'''
        self.assertEqual(extract_goal_titles(text), ['Backlog Reduction', 'AI Adoption'])

    def test_handles_wrapped_titles_and_ignores_metadata(self):
        text = '''
Goals

Microsoft High-Severity
Incident Prevention
Unplanned downtime target.
Due Date: 31/12/2026
Status: In Progress
Completion Date:
Category: Performance Objective
Organization Alignment: Team
Weight: 15
'''
        self.assertEqual(
            extract_goal_titles(text),
            ['Microsoft High-Severity Incident Prevention'],
        )

    def test_ignores_form_feeds_and_metadata_when_collecting_titles(self):
        text = '''
Goals
\f
Goal A

Description A.
\f
Due Date: 31/12/2026
Weight: 50
\f
Goal B

Description B.
Weight: 50
'''
        self.assertEqual(extract_goal_titles(text), ['Goal A', 'Goal B'])

    def test_bounds_a_title_group_that_runs_into_a_description(self):
        """A description without terminal punctuation is indistinguishable from
        a wrapped title, so the merge is bounded rather than unbounded. (A
        *short* unpunctuated description still merges — known ambiguity.)"""
        text = (
            'Goals\n'
            'Short Title\n'
            'first unpunctuated description line about automation adoption\n'
            'second unpunctuated description line about quality targets\n'
            'Weight: 50\n'
        )

        titles = extract_goal_titles(text)

        self.assertEqual(len(titles), 1)
        self.assertLessEqual(len(titles[0]), TITLE_MAX_CHARS)
        self.assertNotIn('quality targets', titles[0])

    def test_deduplicates_titles_in_first_seen_order(self):
        text = '''
Goals
Duplicate Goal
Weight: 20
Duplicate   Goal
Weight: 20
Another Goal
Weight: 60
'''
        self.assertEqual(
            extract_goal_titles(text), ['Duplicate Goal', 'Another Goal'])

    def test_missing_goals_section_fails_closed(self):
        with self.assertRaises(GoalImportError):
            extract_goal_titles('Employee review\nWeight: 100')

    def test_normalize_rejects_invalid_or_duplicate_goal_lists(self):
        for raw in (
            None,
            'Goal A',
            ['Goal A', 'Goal B', 'Goal C', 'Goal D'],
            ['Goal A', 'Goal B', 'Goal C', 'Goal D', '   '],
            ['Goal A', 'Goal B', 'Goal C', 'Goal D', 'goal a'],
            ['Goal A', 'Goal B', 'Goal C', 'Goal D', 'x' * 256],
            ['Goal A', 'Goal B', 'Goal C', 'Goal D', 42],
            ['Goal A', 'Goal B', 'Goal C', 'Goal D', 'Goal E', '   '],
            [f'Goal {i}' for i in range(51)],
        ):
            with self.subTest(raw=raw):
                with self.assertRaises(GoalImportError):
                    normalize_goal_titles(raw)

    def test_normalize_accepts_the_maximum_goal_count(self):
        titles = [f'Goal {i}' for i in range(50)]
        self.assertEqual(normalize_goal_titles(titles), titles)

    def test_extract_rejects_more_than_the_maximum_candidates(self):
        def text_for(count):
            blocks = ''.join(f'Goal {i}\n\nWeight: 1\n' for i in range(count))
            return 'Goals\n' + blocks

        with self.assertRaises(GoalImportError):
            extract_goal_titles(text_for(51))
        self.assertEqual(len(extract_goal_titles(text_for(50))), 50)

    def test_normalize_collapses_whitespace_and_preserves_order(self):
        self.assertEqual(
            normalize_goal_titles(
                [' Goal  A ', 'Goal B', 'Goal C', 'Goal D', 'Goal E']
            ),
            ['Goal A', 'Goal B', 'Goal C', 'Goal D', 'Goal E'],
        )


class ParseGoalPdfEndpointTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        call_command('seed_plugin_permissions')
        self.leader = _make_user('leader_goal_pdf')
        _assign_tl_role(self.leader)
        self.member = _make_user('member_goal_pdf')
        self.member.profile.italian_tl = self.leader
        self.member.profile.save()
        self.cycle = EPRCycle.objects.create(user=self.member, year=2026)

    def _parse(self, user=None, stage='goal_setting', upload=None):
        data = {'stage': stage}
        if upload is not None:
            data['file'] = upload
        request = self.factory.post(
            f'/x/{self.cycle.id}/parse_goal_pdf/', data, format='multipart')
        force_authenticate(request, user=user or self.leader)
        return EPRCycleViewSet.as_view({'post': 'parse_goal_pdf'})(
            request, pk=self.cycle.id)

    def test_returns_titles_without_persisting_pdf_or_goals(self):
        resp = self._parse(upload=_pdf_upload())

        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['goal_titles'], EXPECTED_TITLES)
        self.assertEqual(EPRGoal.objects.count(), 0)
        self.assertEqual(EPRStageRecord.objects.count(), 0)
        self.cycle.refresh_from_db()
        self.assertIsNone(self.cycle.goal_setting_completed_at)

    def test_rejects_missing_file(self):
        resp = self._parse()
        self.assertEqual(resp.status_code, 400)
        self.assertIn('file', resp.data)

    def test_rejects_wrong_extension_and_signature(self):
        for upload in (
            _pdf_upload(name='goals.txt'),
            _pdf_upload(content=b'not a pdf'),
        ):
            with self.subTest(upload=upload.name):
                resp = self._parse(upload=upload)
                self.assertEqual(resp.status_code, 400)
                self.assertIn('file', resp.data)

    def test_rejects_oversized_file_before_parsing(self):
        oversized = _pdf_upload(
            content=b'%PDF-1.4\n' + (b'0' * MAX_UPLOAD_BYTES)
        )
        resp = self._parse(upload=oversized)
        self.assertEqual(resp.status_code, 400)
        self.assertIn('file', resp.data)

    def test_rejects_blank_pdf(self):
        buffer = BytesIO()
        pdf = canvas.Canvas(buffer, pagesize=letter)
        pdf.save()
        resp = self._parse(upload=_pdf_upload(content=buffer.getvalue()))
        self.assertEqual(resp.status_code, 400)
        self.assertIn('file', resp.data)

    def test_rejects_encrypted_pdf(self):
        buffer = BytesIO()
        writer = PdfWriter()
        writer.add_blank_page(width=letter[0], height=letter[1])
        writer.encrypt('secret')
        writer.write(buffer)
        resp = self._parse(upload=_pdf_upload(content=buffer.getvalue()))
        self.assertEqual(resp.status_code, 400)
        self.assertIn('file', resp.data)

    def test_bounds_reads_when_upload_has_no_size_attribute(self):
        upload = _pdf_upload(content=b'%PDF-1.4\n' + (b'0' * MAX_UPLOAD_BYTES))
        upload.size = None
        resp = self._parse(upload=upload)
        self.assertEqual(resp.status_code, 400)
        self.assertIn('file', resp.data)

    def test_returns_a_fewer_than_five_preview_for_manual_correction(self):
        titles = ['Goal A', 'Goal B']
        resp = self._parse(upload=_pdf_upload(content=_workday_pdf(titles)))
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['goal_titles'], titles)
        self.assertEqual(EPRGoal.objects.count(), 0)

    def test_rejects_pdf_without_weight_blocks(self):
        content = _pdf_with_lines(['Goals', 'Only Title', 'Description only'])
        resp = self._parse(upload=_pdf_upload(content=content))
        self.assertEqual(resp.status_code, 400)
        self.assertIn('file', resp.data)

    def test_rejects_final_review_and_completed_goal_stage(self):
        resp = self._parse(stage='final_review', upload=_pdf_upload())
        self.assertEqual(resp.status_code, 400)
        self.assertIn('stage', resp.data)

        self.cycle.goal_setting_completed_at = self.cycle.created_at
        self.cycle.save(update_fields=['goal_setting_completed_at'])
        resp = self._parse(upload=_pdf_upload())
        self.assertEqual(resp.status_code, 400)
        self.assertIn('stage', resp.data)

        self.cycle.final_review_completed_at = self.cycle.created_at
        self.cycle.save(update_fields=['final_review_completed_at'])
        resp = self._parse(stage='mid_year', upload=_pdf_upload())
        self.assertEqual(resp.status_code, 400)
        self.assertIn('stage', resp.data)

    def test_is_scoped_to_the_team_cycle(self):
        outsider = _make_user('outsider_goal_pdf')
        _assign_tl_role(outsider)
        outsider_cycle = EPRCycle.objects.create(user=outsider, year=2026)
        request = self.factory.post(
            f'/x/{outsider_cycle.id}/parse_goal_pdf/',
            {'stage': 'goal_setting', 'file': _pdf_upload()},
            format='multipart',
        )
        force_authenticate(request, user=self.leader)
        resp = EPRCycleViewSet.as_view({'post': 'parse_goal_pdf'})(
            request, pk=outsider_cycle.id)
        self.assertEqual(resp.status_code, 404)
