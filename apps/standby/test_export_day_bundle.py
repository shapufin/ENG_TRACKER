"""One export row per person and day when a night is stored as several segments (item 63)."""
import csv
import io
from datetime import date, time

import openpyxl
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from apps.overtime.models import OvertimeLog
from apps.reports.services.export_service import export_service
from apps.standby.models import StandbyLog

DAY = date(2026, 11, 17)


def make(user, day, start, end, status='approved', description=''):
    return StandbyLog.objects.create(
        user=user, date=day, start_time=start, end_time=end, status=status, description=description)


class StandbyExportDayBundleTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='exp_emp', password='x', first_name='Eva', last_name='Day')
        make(self.user, DAY, time(18, 0), time(0, 0), description='night')
        make(self.user, DAY, time(0, 0), time(9, 0), description='morning')
        make(self.user, date(2026, 11, 18), time(18, 0), time(0, 0))

    def test_csv_has_one_row_per_day_with_the_total(self):
        api = APIClient()
        api.force_authenticate(self.user)
        response = api.get('/api/standby/logs/export/')
        self.assertEqual(response.status_code, 200)
        text = b''.join(response.streaming_content).decode('utf-8-sig')
        rows = list(csv.reader(io.StringIO(text)))
        self.assertEqual(rows[0][:3], ['User', 'Date', 'Hours'])
        by_date = {r[1]: r for r in rows[1:]}
        self.assertEqual(len(rows) - 1, 2)
        self.assertEqual(by_date['17/11/2026'][2], '15')
        self.assertEqual(by_date['17/11/2026'][4], 'morning; night')
        self.assertEqual(by_date['18/11/2026'][2], '6')

    def test_csv_never_merges_different_statuses(self):
        make(self.user, DAY, time(10, 0), time(12, 0), status='pending')
        api = APIClient()
        api.force_authenticate(self.user)
        text = b''.join(api.get('/api/standby/logs/export/').streaming_content).decode('utf-8-sig')
        self.assertEqual(len(list(csv.reader(io.StringIO(text)))) - 1, 3)

    def test_excel_lists_both_segments_in_one_row(self):
        data = export_service.export_ot_standby_to_excel(
            OvertimeLog.objects.none(), StandbyLog.objects.all())
        sheet = openpyxl.load_workbook(io.BytesIO(data)).worksheets[0]
        rows = [[c.value for c in r] for r in sheet.iter_rows(min_row=2)]
        self.assertEqual(len(rows), 2)
        day = next(r for r in rows if r[1] == '17/11/2026')
        self.assertEqual(day[3], '00:00 / 18:00')
        self.assertEqual(day[4], '09:00 / 00:00')
        self.assertEqual(float(day[5]), 15.0)
        single = next(r for r in rows if r[1] == '18/11/2026')
        self.assertEqual((single[3], single[4]), ('18:00', '00:00'))
