"""The Backup team's export end to end: reader, day-first dates, status grouping, breakdowns, import.

Synthetic data only (the real exports carry customer names and stay out of the repo).
"""
import io
from datetime import date

import openpyxl
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.overtime.models.core import Client
from plugins.ticket_kpi.analytics import _build_field_breakdowns
from plugins.ticket_kpi.management.commands.seed_backup_profile import BACKUP_COLUMNS
from plugins.ticket_kpi.mapping_engine import ColumnMapper
from plugins.ticket_kpi.models import ExportProfile, MonthlyKPI, NormalizedTicket, TicketImportBatch
from plugins.ticket_kpi.status_groups import status_group
from plugins.ticket_kpi.viewsets import TicketUploadViewSet

User = get_user_model()
factory = APIRequestFactory()

TICKETS = [
    # code, status, type, org, ce, origination, open, close
    ('RN:1', 'Closed Satisfaction Verified', 'Incident', 'ALFA MONITORING MS', 'COMMVAULT', 'BMS', '01/10/2026 09:00', '01/10/2026 14:12'),
    ('RN:2', 'Closed', 'Change', 'BETA MONITORING MS', 'VEEAM', 'EMAIL', '05/10/2026 23:45', '06/10/2026 01:45'),
    ('RN:3', 'Closed on first call', 'Standard Service Request', 'ALFA MONITORING MS', 'COMMVAULT', 'BMS', '16/10/2026 08:00', '16/10/2026 08:30'),
    ('RN:4', 'In Progress', 'Incident', 'ALFA MONITORING MS', 'VARIOUS', 'BMS', '20/10/2026 10:00', ''),
]


def export_bytes(tickets=TICKETS, many_columns=True):
    """Workbook shaped like the real download: decoy sheet, title row, extra columns."""
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    decoy = wb.create_sheet('Filters')
    decoy.append(['Filters'])
    decoy.append([])
    decoy.append([])
    decoy.append(['Request Status', 'Code', 'Status', 'Request Type', 'Earliest Open Date', 'Latest Open Date'])
    decoy.append(['', '', '', '', '01/10/2026', '30/10/2026'])
    ws = wb.create_sheet('Report Request')
    ws.append(['Request'])
    extra = ['Request Status', 'Business Role', 'Agreed Implementation Date']
    ws.append((extra if many_columns else []) + list(BACKUP_COLUMNS) + (['Agreed Implementation Date'] if many_columns else []))
    for code, status, kind, org, ce, orig, opened, closed in tickets:
        values = {
            'Code': code, 'Status': status, 'Request Type': kind, 'Requester Org.': org, 'CE': ce,
            'Origination': orig, 'Validator': 'BACKUP RED', 'Analyst': 'JANE DOE', 'Driver Group': 'BACKUP RED',
            'Summary': f'summary {code}', 'Solutions': f'solution {code}', 'Open Date': opened, 'Close Date': closed,
        }
        ws.append((['Inactive', 'x', None] if many_columns else []) + [values[c] for c in BACKUP_COLUMNS]
                  + ([None] if many_columns else []))
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


class BackupProfileTestBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_backup_profile', verbosity=0)
        cls.profile = ExportProfile.objects.get(name__startswith='Backup team')


class SeedCommandTests(BackupProfileTestBase):
    def test_seed_is_idempotent_and_repairs_a_changed_profile(self):
        ExportProfile.objects.filter(pk=self.profile.pk).update(keep_columns=['Code'])
        call_command('seed_backup_profile', verbosity=0)
        self.assertEqual(ExportProfile.objects.filter(name__startswith='Backup team').count(), 1)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.keep_columns, list(BACKUP_COLUMNS))

    def test_if_missing_creates_the_profile_on_a_fresh_database(self):
        ExportProfile.objects.filter(name__startswith='Backup team').delete()
        call_command('seed_backup_profile', '--if-missing', verbosity=0)
        created = ExportProfile.objects.get(name__startswith='Backup team')
        self.assertEqual(created.keep_columns, list(BACKUP_COLUMNS))
        self.assertTrue(created.is_active)

    def test_if_missing_never_overwrites_an_admin_edit(self):
        ExportProfile.objects.filter(pk=self.profile.pk).update(keep_columns=['Code'], is_active=False)
        call_command('seed_backup_profile', '--if-missing', verbosity=0)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.keep_columns, ['Code'])
        self.assertFalse(self.profile.is_active)

    def test_the_production_boot_creates_the_profile(self):
        from pathlib import Path
        from django.conf import settings
        text = (Path(settings.BASE_DIR) / 'docker' / 'entrypoint.sh').read_text(encoding='utf-8')
        self.assertIn('python manage.py seed_backup_profile --if-missing', text)

    def test_closed_keeps_its_capital_so_the_labels_read_alike(self):
        self.assertEqual(self.profile.value_transforms, {'status': {'closed': 'Closed'}})
        mapper = ColumnMapper(profile=self.profile)
        df = mapper.read_file(export_bytes(), 'x.xlsx')
        records, _, _ = mapper.process_file(df, self.profile.field_mapping, self.profile.value_transforms)
        self.assertEqual([r['status'] for r in records][:3],
                         ['Closed Satisfaction Verified', 'Closed', 'Closed on first call'])

    def test_a_ticket_row_carries_its_status_group(self):
        from plugins.ticket_kpi.serializers import NormalizedTicketSerializer
        user = User.objects.create_user(username='sg', password='x')
        batch = TicketImportBatch.objects.create(user=user, month=date(2026, 10, 1), record_count=2)
        rows = [NormalizedTicket.objects.create(batch=batch, row_index=i, ticket_id=f'T{i}', status=st)
                for i, st in enumerate(('Closed Satisfaction Verified', 'In Progress'))]
        groups = [NormalizedTicketSerializer(r).data['status_group'] for r in rows]
        self.assertEqual(groups, ['closed', 'open'])

    def test_the_profile_maps_the_standard_fields(self):
        m = self.profile.field_mapping
        self.assertEqual(
            (m['ticket_id'], m['status'], m['created_at'], m['resolved_at'], m['category']),
            ('Code', 'Status', 'Open Date', 'Close Date', 'Request Type'))
        self.assertEqual(self.profile.date_format, '%d/%m/%Y %H:%M')


class DayFirstDateTests(BackupProfileTestBase):
    def parse(self, value):
        return ColumnMapper(profile=self.profile)._parse_datetime(value)

    def test_dates_are_day_first_not_month_first(self):
        # dateutil's default would read 05/10 as 10 May and 16/10 as 16 Oct.
        for text, month, day in (('05/10/2026 23:45', 10, 5), ('01/10/2026 09:00', 10, 1), ('16/10/2026 08:00', 10, 16)):
            parsed = self.parse(text)
            self.assertEqual((parsed.month, parsed.day), (month, day), text)

    def test_an_excel_datetime_is_kept_as_is(self):
        from datetime import datetime
        self.assertEqual(self.parse(datetime(2026, 10, 5, 8, 0)).day, 5)

    def test_an_unreadable_date_is_a_row_error_not_a_silent_blank(self):
        mapper = ColumnMapper(profile=self.profile)
        df = mapper.read_file(export_bytes([TICKETS[0][:6] + ('31/31/2026 09:00', '')]), 'x.xlsx')
        records, errors, _ = mapper.process_file(df, self.profile.field_mapping, {})
        self.assertEqual(records, [])
        self.assertEqual(len(errors), 1)
        self.assertIn('31/31/2026', errors[0])

    def test_a_profile_without_a_date_format_keeps_the_old_parser(self):
        plain = ColumnMapper()
        self.assertEqual((plain._parse_datetime('2026-10-05 08:00').month), 10)


class MapperOnTheExportTests(BackupProfileTestBase):
    def test_only_the_kept_columns_reach_raw_data_and_dates_land_in_the_right_month(self):
        mapper = ColumnMapper(profile=self.profile)
        df = mapper.read_file(export_bytes(), 'x.xlsx')
        records, errors, _ = mapper.process_file(df, self.profile.field_mapping, {})
        self.assertEqual(errors, [])
        self.assertEqual(len(records), 4)
        self.assertEqual(set(records[0]['raw_data']), set(BACKUP_COLUMNS))
        self.assertNotIn('Request Status', records[0]['raw_data'])
        self.assertEqual(mapper.suggest_month(df, 'Open Date'), '2026-10-01')
        self.assertEqual(records[1]['time_to_resolution_hours'], 2.0)   # 23:45 -> 01:45 next day
        self.assertEqual(records[0]['time_to_resolution_hours'], 5.2)
        self.assertIsNone(records[3].get('resolved_at'))                 # still open
        self.assertNotIn('time_to_resolution_hours', records[3])

    def test_extra_columns_in_the_download_change_nothing(self):
        mapper = ColumnMapper(profile=self.profile)
        wide = mapper.read_file(export_bytes(many_columns=True), 'x.xlsx')
        narrow = mapper.read_file(export_bytes(many_columns=False), 'x.xlsx')
        self.assertEqual(wide.values.tolist(), narrow.values.tolist())


class StatusAndBreakdownTests(TestCase):
    def test_every_closed_wording_of_the_export_is_closed(self):
        for word in ('Closed Satisfaction Verified', 'Closed', 'Closed on first call'):
            self.assertEqual(status_group(word), 'closed', word)
        self.assertEqual(status_group('Not closed yet'), 'other')

    def test_identifying_and_free_text_columns_are_not_breakdowns(self):
        user = User.objects.create_user(username='bd', password='x')
        batch = TicketImportBatch.objects.create(user=user, month=date(2026, 10, 1), record_count=30)
        for i in range(30):
            NormalizedTicket.objects.create(
                batch=batch, row_index=i, ticket_id=f'RN:{i}', status='Closed',
                raw_data={'Code': f'RN:{i}', 'Summary': f'text {i}', 'Open Date': f'{i:02d}/10/2026 09:00',
                          'CE': 'COMMVAULT' if i % 3 else 'VEEAM'})
        breakdowns = _build_field_breakdowns(list(NormalizedTicket.objects.all()))
        self.assertIn('CE', breakdowns)
        for noisy in ('Code', 'Summary', 'Open Date'):
            self.assertNotIn(noisy, breakdowns)

    def test_a_small_month_keeps_its_breakdowns(self):
        user = User.objects.create_user(username='bd2', password='x')
        batch = TicketImportBatch.objects.create(user=user, month=date(2026, 10, 1), record_count=4)
        for i, ce in enumerate(('A', 'B', 'C', 'D')):
            NormalizedTicket.objects.create(batch=batch, row_index=i, ticket_id=f'T{i}', raw_data={'CE': ce})
        self.assertIn('CE', _build_field_breakdowns(list(NormalizedTicket.objects.all())))


class ImportEndToEndTests(BackupProfileTestBase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.member = User.objects.create_user(username='bk_member', password='x')
        client = Client.objects.create(name='BK', code='BK')
        cls.member.profile.clients.add(client)
        cls.client_id = client.id

    def call(self, action, data=None, name='export.xlsx'):
        payload = {'file': SimpleUploadedFile(name, data or export_bytes()),
                   'profile_id': self.profile.id, 'month': '2026-10-01',
                   'client_ids': str(self.client_id)}
        request = factory.post('/x/', payload, format='multipart')
        force_authenticate(request, self.member)
        return TicketUploadViewSet.as_view({'post': action})(request)

    def test_analyze_recognises_the_backup_format_and_the_month(self):
        response = self.call('analyze')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['suggested_profile']['id'], self.profile.id)
        self.assertEqual(response.data['suggested_month'], '2026-10-01')
        self.assertEqual(response.data['total_rows'], 4)

    def test_analyze_says_why_a_format_did_not_match(self):
        wb = openpyxl.Workbook()
        wb.active.append(['Code', 'Status', 'Open Date'])
        wb.active.append(['RN:1', 'Closed', '01/10/2026 09:00'])
        buf = io.BytesIO()
        wb.save(buf)
        response = self.call('analyze', buf.getvalue())
        self.assertEqual(response.status_code, 200, response.data)
        self.assertNotIn('suggested_profile', response.data)
        self.assertNotIn('suggested_month', response.data)  # 01/10 must not become 10 January
        hint = response.data['profile_hints'][0]
        self.assertEqual(hint['profile'], self.profile.name)
        self.assertIn('Close Date', hint['reason'])

    def test_a_matching_file_carries_no_hints(self):
        self.assertNotIn('profile_hints', self.call('analyze').data)

    def test_import_stores_four_tickets_and_the_right_figures(self):
        response = self.call('import_batch')
        self.assertEqual(response.status_code, 201, response.data)
        kpi = MonthlyKPI.objects.get(user=self.member, month=date(2026, 10, 1))
        self.assertEqual((kpi.total_tickets, kpi.closed_tickets, kpi.open_tickets), (4, 3, 1))
        self.assertEqual(NormalizedTicket.objects.filter(batch__user=self.member).count(), 4)
        self.assertIn('CE', kpi.field_breakdowns)

    def test_preview_does_not_warn_about_a_field_the_format_never_had(self):
        response = self.call('preview')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertNotIn('missing_priority', response.data['issues'])
        self.assertEqual(response.data['issues'].get('missing_resolved_at'), 1)   # the one open ticket
        self.assertEqual(response.data['unmapped_statuses'], [])

    def test_a_profile_without_keep_columns_still_warns_about_every_standard_field(self):
        plain = ColumnMapper().validate_preview([{'ticket_id': 'A', 'raw_data': {}}])
        self.assertIn('missing_priority', plain['issues'])

    def test_a_file_missing_a_needed_column_is_refused_with_its_name(self):
        wb = openpyxl.Workbook()
        wb.active.append(['Code', 'Status', 'Open Date'])
        wb.active.append(['RN:1', 'Closed', '01/10/2026 09:00'])
        buf = io.BytesIO()
        wb.save(buf)
        for action in ('preview', 'import_batch'):
            response = self.call(action, buf.getvalue())
            self.assertEqual(response.status_code, 400, action)
            self.assertIn('Close Date', response.data['error'])
        self.assertFalse(TicketImportBatch.objects.filter(user=self.member).exists())
