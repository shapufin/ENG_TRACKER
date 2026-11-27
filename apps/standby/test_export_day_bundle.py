"""Files list one row per standby segment, evening before the morning tail (item 63)."""
import csv
import io
from datetime import date, time

import openpyxl
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from apps.overtime.models import Client, OvertimeLog
from apps.reports.services.export_service import export_service
from apps.standby.models import StandbyLog

DAY = date(2026, 11, 17)  # a Tuesday
CSV_COLUMNS = ['User', 'Date', 'Day', 'Start Time', 'End Time', 'Total Hours', 'Type', 'Status',
               'Description', 'Evidence']


def make(user, day, start, end, status='approved', **extra):
    return StandbyLog.objects.create(user=user, date=day, start_time=start, end_time=end, status=status, **extra)


class StandbyExportSegmentTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='exp_emp', password='x', first_name='Eva', last_name='Day')
        # Created morning first, so neither insertion nor start-time order gives the wanted result.
        make(self.user, DAY, time(0, 0), time(9, 0), description='morning')
        make(self.user, DAY, time(18, 0), time(0, 0), description='night')

    def _csv(self):
        api = APIClient()
        api.force_authenticate(self.user)
        response = api.get('/api/standby/logs/export/?ignore_date_filter=true')
        self.assertEqual(response.status_code, 200)
        return list(csv.reader(io.StringIO(b''.join(response.streaming_content).decode('utf-8-sig'))))

    def _excel(self):
        data = export_service.export_ot_standby_to_excel(OvertimeLog.objects.all(), StandbyLog.objects.all())
        sheet = openpyxl.load_workbook(io.BytesIO(data)).worksheets[0]
        return [[c.value for c in r] for r in sheet.iter_rows(min_row=2)]

    def test_csv_lists_each_segment_evening_first(self):
        rows = self._csv()
        self.assertEqual(rows[0], CSV_COLUMNS)
        self.assertEqual(
            [r[1:8] for r in rows[1:]],
            [['17/11/2026', 'Tuesday', '18:00', '00:00', '6', 'On Call Service', 'approved'],
             ['17/11/2026', 'Tuesday', '00:00', '09:00', '9', 'On Call Service', 'approved']],
        )

    def test_excel_lists_each_segment_evening_first(self):
        self.assertEqual(
            [(r[1], r[3], r[4], float(r[5])) for r in self._excel()],
            [('17/11/2026', '18:00', '00:00', 6.0), ('17/11/2026', '00:00', '09:00', 9.0)],
        )

    def test_csv_and_excel_use_the_same_order_for_every_shape(self):
        make(self.user, DAY, time(10, 0), time(12, 0), status='pending')  # status never reorders a day
        make(self.user, date(2026, 11, 14), time(0, 0), time(0, 0))        # 24h row is not a tail
        make(self.user, date(2026, 11, 18), time(18, 0), time(0, 0))
        StandbyLog.objects.create(user=self.user, date=DAY, hours=1, status='approved')  # plain hours first
        csv_order = [(r[1], r[3], r[4]) for r in self._csv()[1:]]
        self.assertEqual(
            [row for row in csv_order if row[0] == '17/11/2026'],
            [('17/11/2026', '', ''), ('17/11/2026', '10:00', '12:00'), ('17/11/2026', '18:00', '00:00'),
             ('17/11/2026', '00:00', '09:00')],
        )
        # The workbook exports one status at a time in the app; with all rows it must still agree per date.
        excel_order = [(r[1], r[3] or '', r[4] or '') for r in self._excel()]
        for day in ('14/11/2026', '17/11/2026', '18/11/2026'):
            self.assertEqual([r for r in excel_order if r[0] == day], [r for r in csv_order if r[0] == day], day)

    def test_an_early_overtime_entry_keeps_time_order(self):
        client = Client.objects.create(name='Exp Client', code='EXC')
        for start, end in ((time(19, 0), time(21, 0)), (time(0, 0), time(2, 0))):
            OvertimeLog.objects.create(
                user=self.user, client=client, date=DAY, start_time=start, end_time=end,
                hours=2, status='approved', description='x')
        self.assertEqual([r[3] for r in self._excel() if r[6] == 'Extra hours'], ['00:00', '19:00'])
        api = APIClient()
        api.force_authenticate(self.user)
        body = b''.join(api.get('/api/overtime/logs/export/?ignore_date_filter=true').streaming_content)
        rows = list(csv.reader(io.StringIO(body.decode('utf-8-sig'))))
        self.assertEqual(rows[0], ['User', 'Date', 'Day', 'Start Time', 'End Time', 'Total Hours', 'Type', 'Client',
                                   'Status', 'Evidence Type', 'Evidence', 'Reference Code', 'Description'])
        self.assertEqual(
            [r[1:7] for r in rows[1:]],
            [['17/11/2026', 'Tuesday', '00:00', '02:00', '2', 'Extra hours'],
             ['17/11/2026', 'Tuesday', '19:00', '21:00', '2', 'Extra hours']],
        )
