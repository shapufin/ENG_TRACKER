"""Reading a team's export: find the real header row and sheet, keep only the chosen columns.

The Backup team's download has a decoy "Filters" sheet, a title row above the real
header, 90 columns of which 13 matter, and one header repeated. These tests build
workbooks with that shape (no customer data) and pin the rules.
"""
import io
from datetime import datetime

import openpyxl
from django.test import SimpleTestCase

from plugins.ticket_kpi.export_reader import ExportFormatError, read_export

KEEP = ['Code', 'Status', 'Request Type', 'Open Date', 'Close Date']


def workbook(sheets):
    """sheets: {name: [row, row, ...]} -> xlsx bytes."""
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for name, rows in sheets.items():
        ws = wb.create_sheet(name)
        for row in rows:
            ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def real_sheet(header_row=2, extra=True):
    """A data sheet: `header_row - 1` leading rows, then header and tickets."""
    lead = [['Request'] + [None] * 6] + [[None] * 7] * (header_row - 2)
    header = ['Request Status', 'Code', 'Status', 'Request Type', 'Agreed Implementation Date',
              'Open Date', 'Close Date', 'Agreed Implementation Date'] if extra else KEEP
    rows = [
        ['Inactive', 'RN:1', 'Closed Satisfaction Verified', 'Incident', None, '01/10/2026 09:00', '01/10/2026 14:12', None],
        ['Inactive', 'RN:2', 'Closed', 'Change', None, '05/10/2026 23:45', '', None],
    ]
    if not extra:
        rows = [[r[1], r[2], r[3], r[5], r[6]] for r in rows]
    return lead + [header] + rows


DECOY = [['Filters'] + [None] * 7, [None] * 8, [None] * 8,
         ['Request Status', 'Code', 'Status', 'Request Type', 'Earliest Open Date',
          'Latest Open Date', 'Earliest Close Date', 'Latest Close Date'],
         ['', '', '', '', '01/10/2026', '30/10/2026', None, None]]


class HeaderAndSheetDetectionTests(SimpleTestCase):
    def read(self, data, name='x.xlsx', keep=KEEP):
        return read_export(data, name, keep)

    def test_decoy_sheet_and_title_row_are_skipped(self):
        df = self.read(workbook({'Filters': DECOY, 'Report Request': real_sheet()}))
        self.assertEqual(list(df.columns), KEEP)
        self.assertEqual(list(df['Code']), ['RN:1', 'RN:2'])

    def test_only_the_chosen_columns_come_back_and_a_repeated_header_is_harmless(self):
        df = self.read(workbook({'Report Request': real_sheet()}))
        self.assertEqual(list(df.columns), KEEP)
        self.assertNotIn('Request Status', df.columns)

    def test_header_row_may_sit_anywhere_in_the_first_rows(self):
        for header_row in (2, 5, 12):
            df = self.read(workbook({'Data': real_sheet(header_row=header_row)}))
            self.assertEqual(len(df), 2, header_row)

    def test_columns_may_be_reordered_and_spelled_loosely(self):
        sheet = [['  close   DATE', 'open date', 'REQUEST type', 'status ', 'code'],
                 ['', '01/10/2026 09:00', 'Incident', 'Closed', 'RN:9']]
        df = self.read(workbook({'S': sheet}))
        self.assertEqual(list(df.columns), KEEP)
        self.assertEqual(df.iloc[0]['Code'], 'RN:9')
        self.assertTrue(df.iloc[0]['Close Date'] is None or df.iloc[0]['Close Date'] != df.iloc[0]['Close Date'])

    def test_a_decoy_with_every_column_but_less_data_loses(self):
        decoy = [KEEP, ['RN:0', 'Open', 'Incident', '01/10/2026 09:00', '']]
        df = self.read(workbook({'Decoy': decoy, 'Real': real_sheet()}))
        self.assertEqual(list(df['Code']), ['RN:1', 'RN:2'])

    def test_blank_rows_are_dropped_and_excel_dates_survive(self):
        opened = datetime(2026, 10, 5, 23, 45)
        sheet = [KEEP, ['RN:1', 'Closed', 'Incident', opened, None], [None] * 5, ['', '', '', '', '']]
        df = self.read(workbook({'S': sheet}))
        self.assertEqual(len(df), 1)
        self.assertEqual(df.iloc[0]['Open Date'], opened)

    def test_csv_with_a_title_row(self):
        text = 'Request\n' + ','.join(KEEP) + '\nRN:1,Closed,Incident,01/10/2026 09:00,\n'
        df = self.read(text.encode('utf-8-sig'), 'x.csv')
        self.assertEqual(list(df['Code']), ['RN:1'])


class RefusalTests(SimpleTestCase):
    def test_a_missing_column_is_named(self):
        sheet = [['Code', 'Status', 'Request Type', 'Open Date'], ['RN:1', 'Closed', 'Incident', 'x']]
        with self.assertRaises(ExportFormatError) as ctx:
            read_export(workbook({'S': sheet}), 'x.xlsx', KEEP)
        self.assertIn('Close Date', str(ctx.exception))
        self.assertNotIn('Code', str(ctx.exception))

    def test_a_file_without_the_header_is_refused(self):
        with self.assertRaises(ExportFormatError):
            read_export(workbook({'S': [['a', 'b'], [1, 2]]}), 'x.xlsx', KEEP)

    def test_an_unreadable_file_is_a_format_error_not_a_crash(self):
        with self.assertRaises(ExportFormatError):
            read_export(b'not a spreadsheet', 'x.xlsx', KEEP)
