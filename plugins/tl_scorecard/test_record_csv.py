"""`?file_format=csv` downloads of record lists (single-table CSV counterpart
to the XLSX evidence workbook)."""
import csv
import io

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate
from unittest import mock

from apps.permissions.models import Role, UserRole

from .csv_export import CSV_MAX_ROWS, build_records_csv
from .models import Meeting
from .testing import make_user as _make_user
from .test_tl_scorecard_hbpr import HbprScorecardBase
from .viewsets import MeetingViewSet
from .viewsets_hbpr import HbprViewSet


def _assign_tl_role(user, code='italian_tl'):
    role, _ = Role.objects.get_or_create(code=code, defaults={'name': code})
    UserRole.objects.get_or_create(user=user, role=role, defaults={'is_active': True})


def _parse(content):
    text = content.decode('utf-8-sig')
    return list(csv.reader(io.StringIO(text)))


class RecordCsvTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        call_command('seed_plugin_permissions')
        self.tl = _make_user('tl_csv')
        _assign_tl_role(self.tl)
        self.member = _make_user('member_csv')
        self.member.profile.italian_tl = self.tl
        self.member.profile.save()
        from datetime import date
        self.meeting = Meeting.objects.create(
            organizer=self.tl, meeting_type='tl_sync', counterparty=self.member,
            occurred_on=date.today(), notes='Plan, "quoted" roadmap',
        )
        self.other_tl = _make_user('other_tl_csv')
        _assign_tl_role(self.other_tl)
        Meeting.objects.create(
            organizer=self.other_tl, meeting_type='tl_sync', counterparty=self.other_tl,
            occurred_on=date.today(), notes='Unrelated',
        )

    def _get(self, viewset, user, **params):
        request = self.factory.get('/', params)
        force_authenticate(request, user=user)
        return viewset.as_view({'get': 'list'})(request)

    def test_csv_download(self):
        response = self._get(MeetingViewSet, self.tl, file_format='csv')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'text/csv')
        self.assertIn('attachment', response['Content-Disposition'])
        self.assertIn('meetings-', response['Content-Disposition'])
        rows = _parse(response.content)
        header, body = rows[0], rows[1:]
        self.assertIn('id', header)
        self.assertIn('notes', header)
        self.assertEqual(len(body), 1)
        note = body[0][header.index('notes')]
        self.assertEqual(note, 'Plan, "quoted" roadmap')

    def test_csv_never_widens_scope(self):
        response = self._get(MeetingViewSet, self.tl, file_format='csv')
        text = response.content.decode('utf-8-sig')
        self.assertNotIn('Unrelated', text)

    def test_unknown_format_is_400(self):
        response = self._get(MeetingViewSet, self.tl, file_format='xlsx')
        self.assertEqual(response.status_code, 400)

    def test_without_format_the_json_page_is_unchanged(self):
        response = self._get(MeetingViewSet, self.tl)
        self.assertEqual(response.status_code, 200)
        self.assertIn('results', response.data)

    def test_row_cap_is_fail_closed(self):
        with mock.patch.object(MeetingViewSet, 'csv_max_rows', 0):
            response = self._get(MeetingViewSet, self.tl, file_format='csv')
        self.assertEqual(response.status_code, 400)

    def test_build_records_csv_quotes_and_boms(self):
        content = build_records_csv([
            {'id': 1, 'notes': 'a,b"c\nd', 'empty': None, 'tags': ['x', 'y']},
        ])
        rows = _parse(content)
        self.assertEqual(rows[0], ['id', 'notes', 'empty', 'tags'])
        self.assertEqual(rows[1][1], 'a,b"c\nd')
        self.assertEqual(rows[1][2], '')
        self.assertTrue(content.startswith('ï»¿'.encode('latin1')))


class HbprRecordsCsvTests(HbprScorecardBase):
    def _get(self, user, **params):
        request = self.factory.get('/api/plugins/tl_scorecard/hbpr/records/', params)
        force_authenticate(request, user=user)
        return HbprViewSet.as_view({'get': 'records'})(request)

    def test_csv_is_scoped_and_redacted(self):
        response = self._get(self.hbpr, kind='absences', file_format='csv')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'text/csv')
        self.assertIn('hbpr-absences', response['Content-Disposition'])
        rows = _parse(response.content)
        header = rows[0]
        self.assertIn('id', header)
        self.assertEqual(len(rows) - 1, 1)
        # The owner's private notes stay redacted in the HBPR slice.
        self.assertEqual(rows[1][header.index('notes')], '')

    def test_csv_unknown_format_is_400(self):
        response = self._get(self.hbpr, kind='absences', file_format='pdf')
        self.assertEqual(response.status_code, 400)

    def test_csv_cap_is_fail_closed(self):
        from . import csv_export
        with mock.patch.object(csv_export, 'CSV_MAX_ROWS', 0):
            response = self._get(self.hbpr, kind='absences', file_format='csv')
        self.assertEqual(response.status_code, 400)


class TestConstants(TestCase):
    def test_cap_is_sane(self):
        self.assertGreaterEqual(CSV_MAX_ROWS, 100)
        self.assertLessEqual(CSV_MAX_ROWS, 10000)
        _ = timezone.now()


class CsvFormulaSafetyTests(TestCase):
    def test_free_text_starting_with_a_formula_trigger_is_neutralised(self):
        for raw in ('=HYPERLINK("http://x","y")', '+1+1', '-2+3', '@SUM(A1)', '	cmd', '  =1+1'):
            with self.subTest(raw=raw):
                cell = _parse(build_records_csv([{'reason': raw}]))[1][0]
                self.assertTrue(cell.startswith("'"), cell)
                self.assertEqual(cell[1:], raw)

    def test_plain_text_numbers_and_dates_are_untouched(self):
        rows = _parse(build_records_csv([{'a': 'Family emergency', 'b': 5, 'c': '2026-10-04', 'd': None}]))
        self.assertEqual(rows[1], ['Family emergency', '5', '2026-10-04', ''])


class RecordListQueryCountTests(TestCase):
    """Embedded children (attendees, idle updates) must not cost a query per row —
    the CSV download serialises up to CSV_MAX_ROWS of them in one request."""

    def setUp(self):
        self.factory = APIRequestFactory()
        call_command('seed_plugin_permissions')
        self.tl = _make_user('tl_qc')
        _assign_tl_role(self.tl)
        self.people = [_make_user(f'att_qc{i}') for i in range(4)]

    def _meeting_with_attendees(self, n):
        from datetime import date
        from .models import MeetingAttendee
        meeting = Meeting.objects.create(
            organizer=self.tl, meeting_type='tl_sync', counterparty=self.people[0],
            occurred_on=date.today())
        for person in self.people[:n]:
            MeetingAttendee.objects.create(meeting=meeting, user=person, role='member')

    def _queries(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        request = self.factory.get('/')
        force_authenticate(request, user=self.tl)
        with CaptureQueriesContext(connection) as ctx:
            response = MeetingViewSet.as_view({'get': 'list'})(request)
        self.assertEqual(response.status_code, 200)
        return len(ctx)

    def test_meeting_list_queries_do_not_grow_with_attendees(self):
        self._meeting_with_attendees(1)
        few = self._queries()
        for _ in range(3):
            self._meeting_with_attendees(4)
        self.assertEqual(self._queries(), few)

    def test_idle_list_queries_do_not_grow_with_status_updates(self):
        from datetime import date, timedelta
        from .models import IdleFlag, IdleStatusUpdate
        from .viewsets import IdleFlagViewSet

        def count():
            from django.db import connection
            from django.test.utils import CaptureQueriesContext
            request = self.factory.get('/')
            force_authenticate(request, user=self.tl)
            with CaptureQueriesContext(connection) as ctx:
                IdleFlagViewSet.as_view({'get': 'list'})(request)
            return len(ctx)

        def flag(updates):
            f = IdleFlag.objects.create(
                employee=self.people[0], flagged_by=self.tl, flagged_on=date.today())
            for i in range(updates):
                IdleStatusUpdate.objects.create(
                    flag=f, week_of=date.today() - timedelta(weeks=i + 1),
                    status_note='x', recorded_by=self.people[i % 4])

        flag(1)
        few = count()
        for _ in range(3):
            flag(3)
        self.assertEqual(count(), few)
