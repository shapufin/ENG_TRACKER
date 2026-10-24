"""The emailed TL/HR "Extra hours / On Call Service" Excel bundles overtime per paid block.

Entries that share a paid hour read as one row: the paid hours (a whole number),
the span they were worked in, and every ticket or call reference together. The
columns do not change. Standby and entries typed as plain hours stay as they are.
"""
import io
from datetime import date, time

import openpyxl
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from apps.overtime.models import Client, OvertimeLog
from apps.standby.models import StandbyLog

DAY = date(2026, 7, 10)
HEADERS = (
    'Name', 'Date', 'Day', 'Start Time', 'End Time', 'Total Hours', 'Type',
    'Description', 'Evidence Type', 'Evidence', 'Reference Code', 'Status',
)


class PaidBlockBundlingTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.staff = User.objects.create_user(username='bundle-staff', password='x', is_staff=True)
        self.user = User.objects.create_user(
            username='bundle-emp', password='x', first_name='Bundle', last_name='Worker',
        )
        self.client_a = Client.objects.create(name='Client A', code='BDA')
        self.client_b = Client.objects.create(name='Client B', code='BDB')

    def _log(self, start, end, evidence, client=None, description=''):
        return OvertimeLog.objects.create(
            user=self.user, client=client or self.client_a, date=DAY, hours=1,
            start_time=start, end_time=end, evidence_type='ticket', evidence=evidence,
            description=description, status='approved',
        )

    def _rows(self):
        self.api.force_authenticate(user=self.staff)
        response = self.api.get(
            '/api/reports/export-ot-standby/', {'start_date': '2026-07-01', 'end_date': '2026-07-31'},
        )
        self.assertEqual(response.status_code, 200, response.content)
        ws = openpyxl.load_workbook(io.BytesIO(response.content)).active
        rows = [tuple(c.value for c in row)[:12] for row in ws.iter_rows(min_row=1)]
        self.assertEqual(rows[0], HEADERS)
        return rows[1:]

    def test_a_split_hour_reads_as_one_row_of_one_hour(self):
        self._log(time(8, 0), time(8, 30), 'INC-1')
        self._log(time(8, 31), time(9, 0), 'INC-2', client=self.client_b)
        rows = self._rows()
        self.assertEqual(len(rows), 1)
        name, day, _, start, end, hours, kind, _, _, evidence, _, state = rows[0]
        self.assertEqual((name, start, end, hours, kind, state), ('Bundle Worker', '08:00', '09:00', 1, 'Extra hours', 'Approved'))
        self.assertEqual(evidence, 'INC-1, INC-2')

    def test_an_extension_hour_reads_as_one_row_of_two_hours(self):
        self._log(time(8, 0), time(8, 30), 'INC-1')
        self._log(time(8, 40), time(9, 1), 'INC-2')
        rows = self._rows()
        self.assertEqual([(r[3], r[4], r[5], r[9]) for r in rows], [('08:00', '09:01', 2, 'INC-1, INC-2')])

    def test_separate_call_ins_stay_separate_rows(self):
        self._log(time(8, 0), time(8, 30), 'CALL-1')
        self._log(time(20, 0), time(20, 30), 'CALL-2')
        self.assertEqual([(r[3], r[5], r[9]) for r in self._rows()], [('08:00', 1, 'CALL-1'), ('20:00', 1, 'CALL-2')])

    def test_descriptions_are_joined_and_blank_ones_skipped(self):
        self._log(time(8, 0), time(8, 30), 'INC-1', description='restart')
        self._log(time(8, 31), time(9, 0), 'INC-2')
        self.assertEqual(self._rows()[0][7], 'restart')

    def test_plain_hours_and_standby_are_not_bundled(self):
        self._log(time(8, 0), time(8, 30), 'INC-1')
        OvertimeLog.objects.create(
            user=self.user, client=self.client_a, date=DAY, hours=3, evidence_type='call',
            evidence='CALL-PLAIN', status='approved',
        )
        StandbyLog.objects.create(user=self.user, date=DAY, hours=2, status='approved')
        by_kind = {}
        for row in self._rows():
            by_kind.setdefault(row[6], []).append((row[5], row[9]))
        self.assertEqual(sorted(by_kind['Extra hours']), [(1, 'INC-1'), (3, 'CALL-PLAIN')])
        self.assertEqual([hours for hours, _ in by_kind['On Call Service']], [2])
