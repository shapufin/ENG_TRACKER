"""Cross-check: every export and overview agrees with the source tables, on one realistic month of dummy data.

The data is built to hit the edges: an overnight shift, entries sharing a paid hour, a month-end entry, an entry on
the next month's first day, rejected and pending rows, a half day, sick leave and a leave crossing the month boundary.
"""
import io
from datetime import date, time
from decimal import Decimal

import openpyxl
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.leave_management.models import LeaveRequest
from apps.overtime.models import Client, OvertimeLog
from apps.standby.models import StandbyLog
from apps.users.models import UserProfile

User = get_user_model()
JUNE = ('2026-06-01', '2026-06-30')


def _workbook(response):
    assert response.status_code == 200, getattr(response, 'content', b'')[:300]
    return openpyxl.load_workbook(io.BytesIO(response.content), data_only=True)


def _sheet_rows(wb):
    """{sheet title: [row tuples]} without the header row."""
    return {ws.title: [tuple(c.value for c in row) for row in ws.iter_rows(min_row=2)] for ws in wb.worksheets}


class ExportIntegrityBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser(username='ei_admin', email='a@t.com', password='x')
        cls.mgr = User.objects.create_user(username='ei_mgr', password='x', first_name='Mara', last_name='Manager')
        UserProfile.objects.get_or_create(user=cls.mgr)
        cls.client_obj = Client.objects.create(name='Acme', code='ACM')
        cls.people = {}
        for name in ('ana', 'bora'):
            user = User.objects.create_user(username=f'ei_{name}', password='x', first_name=name.title(), last_name='Test')
            profile, _ = UserProfile.objects.get_or_create(user=user)
            profile.italian_tl = cls.mgr
            profile.save()
            cls.people[name] = user
        cls._seed()

    @classmethod
    def _ot(cls, user, day, start, end, status='approved', hours=None, period=None):
        entry = OvertimeLog.objects.create(
            user=user, client=cls.client_obj, date=day, start_time=start, end_time=end,
            hours=hours if hours is not None else 1, description='x', status=status,
            requested_processing_period=period or day.replace(day=1),
        )
        return entry

    @classmethod
    def _seed(cls):
        ana, bora = cls.people['ana'], cls.people['bora']
        # Overtime: two entries sharing one paid hour, an overnight shift, a month-end entry.
        cls._ot(ana, date(2026, 6, 3), time(19, 0), time(19, 30))
        cls._ot(ana, date(2026, 6, 3), time(19, 30), time(20, 0))
        cls._ot(ana, date(2026, 6, 5), time(23, 0), time(1, 0))
        cls._ot(bora, date(2026, 6, 30), time(19, 0), time(21, 0))
        cls._ot(bora, date(2026, 6, 10), time(19, 0), time(21, 0), status='pending')
        cls._ot(bora, date(2026, 6, 11), time(19, 0), time(22, 0), status='rejected')
        cls._ot(bora, date(2026, 7, 1), time(19, 0), time(21, 0))  # next month, must stay out of June
        # Standby: a weekly-generator style night split at midnight.
        for day, start, end in ((date(2026, 6, 8), time(18, 0), time(0, 0)), (date(2026, 6, 9), time(0, 0), time(9, 0)),
                                (date(2026, 6, 9), time(18, 0), time(0, 0))):
            StandbyLog.objects.create(
                user=ana, date=day, start_time=start, end_time=end, hours=Decimal('6') if end == time(0, 0) else Decimal('9'),
                status='approved', description='x', requested_processing_period=date(2026, 6, 1),
            )
        # Leave: full week, half day, sick, a request crossing into July, pending and rejected ones.
        def leave(user, start, end, status='approved', kind='vacation', half=None):
            return LeaveRequest.objects.create(
                user=user, request_type=kind, start_date=start, end_date=end, status=status,
                is_half_day=bool(half), half_day_period=half, reason='r',
            )
        leave(ana, date(2026, 6, 8), date(2026, 6, 12))
        leave(ana, date(2026, 6, 15), date(2026, 6, 15), half='morning')
        leave(bora, date(2026, 6, 16), date(2026, 6, 17), kind='sick')
        leave(bora, date(2026, 6, 29), date(2026, 7, 3))  # crosses the month boundary
        leave(ana, date(2026, 6, 22), date(2026, 6, 23), status='pending')
        leave(bora, date(2026, 6, 24), date(2026, 6, 24), status='rejected')

    def setUp(self):
        self.api = APIClient()
        self.api.force_authenticate(user=self.admin)


def _leave_rows(api, start, end):
    response = api.get('/api/reports/export-leave/', {'start_date': start, 'end_date': end})
    return [row for rows in _sheet_rows(_workbook(response)).values() for row in rows]


class LeaveExportIntegrityTests(ExportIntegrityBase):
    def test_a_leave_crossing_the_month_boundary_is_in_both_months_and_its_days_add_up(self):
        june = [r for r in _leave_rows(self.api, '2026-06-01', '2026-06-30') if r[0] == 'Bora Test' and r[4].startswith('Vacation')]
        july = [r for r in _leave_rows(self.api, '2026-07-01', '2026-07-31') if r[0] == 'Bora Test']
        self.assertEqual(len(june), 1, 'the crossing request is missing from June')
        self.assertEqual(len(july), 1, 'the crossing request is missing from July')
        total = LeaveRequest.objects.get(user=self.people['bora'], start_date=date(2026, 6, 29)).days_counted
        self.assertEqual(june[0][3] + july[0][3], float(total))          # 2 + 3 = 5, nothing counted twice
        self.assertIn('days in this period', june[0][4])                  # and the row says why it is partial

    def test_leave_inside_the_period_is_unchanged_and_only_approved_leave_is_listed(self):
        rows = _leave_rows(self.api, '2026-06-01', '2026-06-30')
        names = sorted((r[0], r[3]) for r in rows)
        self.assertIn(('Ana Test', 5.0), names)
        self.assertIn(('Ana Test', 0.5), names)
        self.assertIn(('Bora Test', 2.0), names)
        self.assertEqual(sum(1 for r in rows if r[5] != 'Approved'), 0)
        full = [r for r in rows if r[0] == 'Ana Test' and r[3] == 5.0][0]
        self.assertNotIn('days in this period', full[4])

    def test_the_whole_year_export_lists_each_request_once_with_its_full_days(self):
        rows = _leave_rows(self.api, '2026-01-01', '2026-12-31')
        self.assertEqual(len(rows), LeaveRequest.objects.filter(status='approved').count())
        self.assertEqual(
            sum(r[3] for r in rows), float(sum(Decimal(row.days_counted) for row in LeaveRequest.objects.filter(status='approved'))),
        )


class OverviewIntegrityTests(ExportIntegrityBase):
    """The summary and the per-user detail must equal what the source rows add up to for the same window."""

    def _get(self, name):
        response = self.api.get(f'/api/reports/{name}/', {'start_date': JUNE[0], 'end_date': JUNE[1]})
        self.assertEqual(response.status_code, 200)
        return response.data

    def test_summary_hours_equal_the_source_rows(self):
        data = self._get('summary')
        june = OvertimeLog.objects.filter(date__gte=date(2026, 6, 1), date__lte=date(2026, 6, 30))
        self.assertEqual(Decimal(str(data['overtime']['total_hours'])), sum(o.hours for o in june))
        self.assertEqual(
            Decimal(str(data['overtime']['approved_hours'])), sum(o.hours for o in june.filter(status='approved')),
        )
        self.assertEqual(data['overtime']['total_entries'], june.count())
        self.assertEqual(data['overtime']['pending_count'], june.filter(status='pending').count())
        standby = StandbyLog.objects.filter(date__gte=date(2026, 6, 1), date__lte=date(2026, 6, 30))
        self.assertEqual(Decimal(str(data['standby']['total_hours'])), sum(s.hours for s in standby))

    def test_summary_leave_counts_a_boundary_request_for_its_days_inside_the_month(self):
        leave = self._get('summary')['leave']
        self.assertEqual(leave['total_requests'], 6)           # all June-overlapping requests, incl. the crossing one
        self.assertEqual(float(leave['approved_days']), 9.5)    # 5 + 0.5 + 2 sick + 2 (29-30 Jun of the crossing one)
        self.assertEqual(float(leave['total_days']), 12.5)      # + 2 pending + 1 rejected

    def test_detailed_per_user_agrees_with_the_summary(self):
        users = {u['username']: u for u in self._get('detailed')['users']}
        summary = self._get('summary')
        ot_total = sum(Decimal(str(u['overtime']['total_hours'])) for u in users.values())
        self.assertEqual(ot_total, Decimal(str(summary['overtime']['total_hours'])))
        days = sum(float(u['leave']['approved_days']) for u in users.values())
        self.assertEqual(days, float(summary['leave']['approved_days']))
        self.assertEqual(float(users['ei_bora']['leave']['approved_days']), 4.0)   # 2 sick + 2 of the crossing request


def _csv_rows(api, url):
    import csv
    response = api.get(url)
    assert response.status_code == 200, response.status_code
    text = b''.join(response.streaming_content).decode('utf-8-sig')
    return list(csv.DictReader(io.StringIO(text)))


class CsvExportIntegrityTests(ExportIntegrityBase):
    def _as(self, name):
        api = APIClient()
        api.force_authenticate(user=self.people[name])
        return api

    def test_overtime_csv_lists_every_own_entry_with_its_paid_hours_and_status(self):
        rows = _csv_rows(self._as('bora'), '/api/overtime/logs/export/?ignore_date_filter=true')
        source = OvertimeLog.objects.filter(user=self.people['bora'])
        self.assertEqual(len(rows), source.count())                       # pending, rejected and next-month rows too
        self.assertEqual(sorted(r['Status'] for r in rows), sorted(o.status for o in source))
        self.assertEqual(sum(Decimal(r['Hours']) for r in rows), sum(o.hours for o in source))

    def test_overtime_csv_never_contains_someone_elses_entries(self):
        rows = _csv_rows(self._as('ana'), '/api/overtime/logs/export/?ignore_date_filter=true')
        self.assertEqual({r['User'] for r in rows}, {'ei_ana'})
        self.assertEqual(sum(Decimal(r['Hours']) for r in rows), Decimal('3'))   # shared paid hour counted once

    def test_the_csv_has_exactly_the_rows_of_the_list_with_the_same_filters(self):
        api = self._as('bora')
        listed = api.get('/api/overtime/logs/?ignore_date_filter=true&page_size=500').data
        listed = listed['results'] if isinstance(listed, dict) else listed
        rows = _csv_rows(api, '/api/overtime/logs/export/?ignore_date_filter=true')
        self.assertEqual(len(rows), len(listed))
        self.assertEqual(sorted(r['Status'] for r in rows), sorted(o['status'] for o in listed))

    def test_standby_csv_bundles_a_person_day_into_one_row_without_losing_hours(self):
        # Documented rule (workflow-invariants item 63): shifts of one date are one row in files.
        rows = _csv_rows(self._as('ana'), '/api/standby/logs/export/?ignore_date_filter=true')
        source = StandbyLog.objects.filter(user=self.people['ana'])
        self.assertEqual(len(rows), len({s.date for s in source}))          # 8 Jun and 9 Jun
        self.assertEqual(sum(Decimal(r['Hours']) for r in rows), sum(s.hours for s in source))   # 6 + 15 = 21


class DashboardIntegrityTests(ExportIntegrityBase):
    def _widget(self, name):
        response = self.api.get(f'/api/dashboard/widgets/{name}/')
        self.assertEqual(response.status_code, 200)
        return response.data

    def test_global_stats_equal_the_source_tables(self):
        data = self._widget('global_stats')
        approved_ot = OvertimeLog.objects.filter(status='approved')
        self.assertEqual(Decimal(str(data['total_overtime_hours'])), sum(o.hours for o in approved_ot))
        for status in ('pending', 'approved', 'rejected'):
            self.assertEqual(data[f'{status}_overtime'], OvertimeLog.objects.filter(status=status).count(), status)
            self.assertEqual(data[f'{status}_leaves'], LeaveRequest.objects.filter(status=status).count(), status)
        self.assertEqual(
            Decimal(str(data['total_standby_hours'])), sum(s.hours for s in StandbyLog.objects.filter(status='approved')),
        )

    def test_the_monthly_trend_matches_the_source_and_splits_a_boundary_leave_by_month(self):
        data = self._widget('admin_trends')
        at = {month: i for i, month in enumerate(data['months'])}
        june, july = at['2026-06'], at['2026-07']
        self.assertEqual(data['hours']['overtime'][june], 5.0)    # ana 3 (shared hour once) + bora 2, approved only
        self.assertEqual(data['hours']['overtime'][july], 2.0)
        self.assertEqual(data['hours']['standby'][june], 21.0)
        self.assertEqual(data['hours']['pending_overtime'][june], 2.0)
        self.assertEqual(data['leave_days']['vacation'][june], 7.5)   # 5 + 0.5 + 2 (29-30 Jun of the crossing request)
        self.assertEqual(data['leave_days']['vacation'][july], 3.0)   # 1-3 Jul of the same request
        self.assertEqual(data['leave_days']['sick'][june], 2.0)
        total = data['leave_days']['vacation'][june] + data['leave_days']['vacation'][july]
        self.assertEqual(total, 7.5 + 3.0)
        self.assertEqual(total, 5 + 0.5 + float(LeaveRequest.objects.get(start_date=date(2026, 6, 29)).days_counted))

    def test_the_overview_pending_backlog_counts_only_pending_rows(self):
        backlog = self._widget('admin_overview')['pending_backlog']
        self.assertEqual(backlog['overtime']['count'], OvertimeLog.objects.filter(status='pending').count())
        self.assertEqual(backlog['overtime']['hours'], float(sum(o.hours for o in OvertimeLog.objects.filter(status='pending'))))
        self.assertEqual(backlog['leave']['count'], LeaveRequest.objects.filter(status='pending').count())
        self.assertEqual(backlog['leave']['days'], float(sum(Decimal(row.days_counted) for row in LeaveRequest.objects.filter(status="pending"))))
