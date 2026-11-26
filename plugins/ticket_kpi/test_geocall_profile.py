"""The Geocall Standard format: the Backup columns plus Incident Severity and Requester.

It reads the same service desk download as the Backup profile, so which one `analyze`
suggests is part of the contract. Synthetic data only.
"""
import io
from datetime import date
from pathlib import Path

import openpyxl
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.overtime.models.core import Client
from plugins.ticket_kpi.management.commands.seed_backup_profile import BACKUP_COLUMNS
from plugins.ticket_kpi.models import ExportProfile, MonthlyKPI, NormalizedTicket
from plugins.ticket_kpi.viewsets import TicketUploadViewSet

User = get_user_model()
factory = APIRequestFactory()

GEOCALL = 'Geocall Standard'
GEOCALL_COLUMNS = list(BACKUP_COLUMNS) + ['Incident Severity', 'Requester']


def workbook(columns, rows=2):
    """The download's shape: a decoy sheet, a title row above the header, then tickets."""
    wb = openpyxl.Workbook()
    wb.active.title = 'Filters'
    wb.active.append(['Request Status', 'Code', 'Status'])
    ws = wb.create_sheet('Report Request')
    ws.append(['Request'])
    ws.append(list(columns))
    for i in range(1, rows + 1):
        values = {
            'Code': f'RN:{i}', 'Status': 'Closed', 'Request Type': 'Incident',
            'Requester Org.': 'ALFA', 'CE': 'VEEAM', 'Open Date': '05/10/2026 09:00',
            'Close Date': '05/10/2026 11:00', 'Incident Severity': 'Severity 5',
            'Requester': 'JOHN ROE',
        }
        ws.append([values.get(c, 'x') for c in columns])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


FULL_DOWNLOAD = ['Request Status'] + GEOCALL_COLUMNS + ['Business Role']


class GeocallTestBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_backup_profile', verbosity=0)
        call_command('seed_geocall_profile', verbosity=0)
        cls.backup = ExportProfile.objects.get(name__startswith='Backup team')
        cls.geocall = ExportProfile.objects.get(name=GEOCALL)
        cls.member = User.objects.create_user(username='gc_member', password='x')
        client = Client.objects.create(name='GC', code='GC')
        cls.member.profile.clients.add(client)
        cls.client_id = client.id

    def call(self, action, data, profile=None):
        payload = {'file': SimpleUploadedFile('export.xlsx', data),
                   'month': '2026-10-01', 'client_ids': str(self.client_id)}
        if profile:
            payload['profile_id'] = profile.id
        request = factory.post('/x/', payload, format='multipart')
        force_authenticate(request, self.member)
        return TicketUploadViewSet.as_view({'post': action})(request)


class SeedTests(GeocallTestBase):
    def test_the_profile_reads_the_backup_columns_plus_severity_and_requester(self):
        self.assertEqual(self.geocall.keep_columns, GEOCALL_COLUMNS)
        m = self.geocall.field_mapping
        self.assertEqual(
            (m['ticket_id'], m['status'], m['priority'], m['requester'], m['created_at']),
            ('Code', 'Status', 'Incident Severity', 'Requester', 'Open Date'))
        self.assertEqual(self.geocall.required_fields, ['ticket_id', 'status', 'created_at'])
        self.assertEqual(self.geocall.date_format, '%d/%m/%Y %H:%M')
        self.assertTrue(self.geocall.is_global)

    def test_seeding_geocall_leaves_the_backup_profile_as_it_was(self):
        self.assertEqual(self.backup.keep_columns, list(BACKUP_COLUMNS))
        self.assertEqual(self.backup.field_mapping['requester'], 'Requester Org.')
        self.assertNotIn('priority', self.backup.field_mapping)

    def test_if_missing_never_overwrites_an_admin_edit_and_the_plain_run_repairs_it(self):
        ExportProfile.objects.filter(pk=self.geocall.pk).update(keep_columns=['Code'])
        call_command('seed_geocall_profile', '--if-missing', verbosity=0)
        self.geocall.refresh_from_db()
        self.assertEqual(self.geocall.keep_columns, ['Code'])
        call_command('seed_geocall_profile', verbosity=0)
        self.geocall.refresh_from_db()
        self.assertEqual(self.geocall.keep_columns, GEOCALL_COLUMNS)
        self.assertEqual(ExportProfile.objects.filter(name=GEOCALL).count(), 1)

    def test_the_production_boot_creates_the_profile(self):
        text = (Path(settings.BASE_DIR) / 'docker' / 'entrypoint.sh').read_text(encoding='utf-8')
        self.assertIn('python manage.py seed_geocall_profile --if-missing', text)


class DetectionTests(GeocallTestBase):
    def suggested(self, columns):
        response = self.call('analyze', workbook(columns))
        self.assertEqual(response.status_code, 200, response.data)
        return response.data['suggested_profile']['id']

    def test_the_full_download_suggests_geocall(self):
        self.assertEqual(self.suggested(FULL_DOWNLOAD), self.geocall.id)

    def test_the_profile_reading_more_columns_wins_whatever_was_seeded_first(self):
        ExportProfile.objects.filter(pk=self.backup.pk).delete()
        call_command('seed_backup_profile', verbosity=0)  # now the newer of the two
        self.assertEqual(self.suggested(FULL_DOWNLOAD), self.geocall.id)

    def test_the_trimmed_backup_file_still_suggests_backup(self):
        self.assertEqual(self.suggested(BACKUP_COLUMNS), self.backup.id)

    def test_when_nothing_fits_the_closest_format_is_explained_first(self):
        columns = [c for c in BACKUP_COLUMNS if c != 'Close Date']
        response = self.call('analyze', workbook(columns))
        self.assertNotIn('suggested_profile', response.data)
        hint = response.data['profile_hints'][0]
        self.assertEqual(hint['profile'], self.backup.name)
        self.assertIn('Close Date', hint['reason'])


class ImportTests(GeocallTestBase):
    def test_import_stores_severity_requester_and_only_the_kept_columns(self):
        response = self.call('import_batch', workbook(FULL_DOWNLOAD), self.geocall)
        self.assertEqual(response.status_code, 201, response.data)
        ticket = NormalizedTicket.objects.filter(batch__user=self.member).first()
        self.assertEqual((ticket.priority, ticket.requester), ('Severity 5', 'JOHN ROE'))
        self.assertEqual((ticket.created_at.month, ticket.time_to_resolution_hours), (10, 2.0))
        self.assertEqual(set(ticket.raw_data), set(GEOCALL_COLUMNS))
        kpi = MonthlyKPI.objects.get(user=self.member, month=date(2026, 10, 1))
        self.assertEqual((kpi.total_tickets, kpi.closed_tickets), (2, 2))
        self.assertEqual(kpi.by_priority, {'Severity 5': 2})

    def test_a_file_without_the_two_extra_columns_is_refused_by_name(self):
        response = self.call('import_batch', workbook(BACKUP_COLUMNS), self.geocall)
        self.assertEqual(response.status_code, 400)
        self.assertIn('Incident Severity', response.data['error'])
        self.assertIn('Requester', response.data['error'])
