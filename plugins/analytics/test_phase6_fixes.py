"""Phase 6 confirmation tests for analytics (A-01..A-05).

Each test reproduces an audit item through the HTTP API.
"""
import io
import os
import tempfile
from datetime import date, timedelta

from django.contrib.auth.models import User
from django.core import mail
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.leave_management.models import LeaveRequest
from apps.plugins.models import PluginPermission
from plugins.analytics.models import ExportJob, ScheduledReport
from plugins.analytics.test_analytics import _ensure_analytics_urls

BASE = '/api/plugins/analytics'


def _public(action):
    PluginPermission.objects.update_or_create(
        plugin_name='analytics', action=action, defaults={'is_public': True},
    )


class ExportJobGrantTests(TestCase):
    """A-04: export-jobs endpoints must require the export grant."""

    @classmethod
    def setUpTestData(cls):
        _ensure_analytics_urls()

    def setUp(self):
        _public('view')  # view only, no export grant
        self.user = User.objects.create_user(username='a04-user', password='x')
        fd, self.path = tempfile.mkstemp(suffix='.csv')
        os.write(fd, b'a,b\n1,2\n')
        os.close(fd)
        self.addCleanup(lambda: os.path.exists(self.path) and os.remove(self.path))
        self.job = ExportJob.objects.create(
            report_format='csv', filter_params={}, created_by=self.user,
            status='completed', file_path=self.path, file_size_bytes=8,
            completed_at=timezone.now(),
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_download_requires_export_grant(self):
        r = self.client.get(f'{BASE}/metrics/export-jobs/{self.job.id}/download/')
        if hasattr(r, 'close'):
            r.close()
        self.assertEqual(r.status_code, 403)

    def test_status_requires_export_grant(self):
        r = self.client.get(f'{BASE}/metrics/export-jobs/{self.job.id}/status/')
        self.assertEqual(r.status_code, 403)

    def test_list_requires_export_grant(self):
        r = self.client.get(f'{BASE}/metrics/export-jobs/')
        self.assertEqual(r.status_code, 403)

    def test_download_allowed_with_export_grant(self):
        _public('export')
        r = self.client.get(f'{BASE}/metrics/export-jobs/{self.job.id}/download/')
        r.close()
        self.assertEqual(r.status_code, 200)


class ExportRangeCapTests(TestCase):
    """A-03: background export date range is capped."""

    @classmethod
    def setUpTestData(cls):
        _ensure_analytics_urls()

    def setUp(self):
        self.admin = User.objects.create_user(username='a03-admin', password='x', is_staff=True)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_range_over_400_days_refused(self):
        r = self.client.post(f'{BASE}/metrics/export-jobs/create/', {
            'format': 'csv', 'date_from': '2024-01-01', 'date_to': '2026-01-01',
        }, format='json')
        self.assertEqual(r.status_code, 400, r.data)
        self.assertFalse(ExportJob.objects.exists())

    def test_range_within_cap_accepted(self):
        from unittest import mock
        with mock.patch('plugins.analytics.viewsets.ExportRunner.start_deferred'):
            r = self.client.post(f'{BASE}/metrics/export-jobs/create/', {
                'format': 'csv', 'date_from': '2026-01-01', 'date_to': '2026-06-30',
            }, format='json')
        self.assertEqual(r.status_code, 201, r.data)

    def test_inverted_range_refused(self):
        r = self.client.post(f'{BASE}/metrics/export-jobs/create/', {
            'format': 'csv', 'date_from': '2026-06-30', 'date_to': '2026-01-01',
        }, format='json')
        self.assertEqual(r.status_code, 400, r.data)


class ScheduledReportValidationTests(TestCase):
    """A-01 / A-02."""

    URL = f'{BASE}/scheduled-reports/'

    @classmethod
    def setUpTestData(cls):
        _ensure_analytics_urls()

    def setUp(self):
        self.admin = User.objects.create_user(username='a01-admin', password='x', is_staff=True)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def _post(self, **over):
        data = {'name': 'R', 'schedule_type': 'weekly', 'report_format': 'csv',
                'recipients': ['a@example.com'], 'filter_preset': {}}
        data.update(over)
        return self.client.post(self.URL, data, format='json')

    def test_recipients_string_rejected(self):
        self.assertEqual(self._post(recipients='a@example.com').status_code, 400)

    def test_recipients_invalid_email_rejected(self):
        self.assertEqual(self._post(recipients=['not-an-email']).status_code, 400)

    def test_filter_preset_teams_must_be_list(self):
        self.assertEqual(self._post(filter_preset={'teams': 'abc'}).status_code, 400)

    def test_filter_preset_not_object_rejected(self):
        self.assertEqual(self._post(filter_preset=['x']).status_code, 400)

    def test_valid_payload_accepted(self):
        r = self._post(filter_preset={'period': 'month', 'teams': [1]})
        self.assertEqual(r.status_code, 201, r.data)

    def test_run_now_pdf_sends_attachment(self):
        report = ScheduledReport.objects.create(
            name='PDF R', recipients=['a@example.com'], report_format='pdf',
            schedule_type='daily',
        )
        r = self.client.post(f'{self.URL}{report.id}/run_now/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertTrue(mail.outbox[0].attachments[0][0].endswith('.pdf'))

    def test_run_now_failure_does_not_advance_next_run(self):
        from unittest import mock
        report = ScheduledReport.objects.create(
            name='Bad R', recipients=['a@example.com'], report_format='csv',
        )
        with mock.patch(
            'plugins.analytics.viewsets.AnalyticsReportGenerator.generate_csv_report',
            return_value=None,
        ):
            r = self.client.post(f'{self.URL}{report.id}/run_now/')
        self.assertGreaterEqual(r.status_code, 400)
        report.refresh_from_db()
        self.assertIsNone(report.next_run_at)
        self.assertEqual(len(mail.outbox), 0)


class ExportFreeTextDocumentationTests(TestCase):
    """A-05 (PRODUCT DECISION NEEDED, awaiting owner).

    Documents CURRENT behaviour only: a non-staff holder of the export grant
    receives org-wide per-person free text (leave reason) in the CSV export.
    If the owner decides to scope or redact it, this test must be updated.
    """

    @classmethod
    def setUpTestData(cls):
        _ensure_analytics_urls()

    def test_export_grant_holder_receives_leave_reason_text(self):
        _public('export')
        _public('view')
        exporter = User.objects.create_user(username='a05-exp', password='x')
        other = User.objects.create_user(username='a05-other', password='x')
        LeaveRequest.objects.create(
            user=other, request_type='sick', start_date=date(2026, 6, 2),
            end_date=date(2026, 6, 2), status='approved', reason='PRIVATE-REASON-A05',
        )
        client = APIClient()
        client.force_authenticate(exporter)
        r = client.get(f'{BASE}/metrics/export/', {
            'export_format': 'excel', 'date_from': (timezone.localdate() - timedelta(days=1)).isoformat(),
            'date_to': (timezone.localdate() + timedelta(days=1)).isoformat(),
        })
        self.assertEqual(r.status_code, 200)
        from openpyxl import load_workbook
        wb = load_workbook(io.BytesIO(r.content))
        cells = [str(c.value) for ws in wb.worksheets for row in ws.iter_rows() for c in row]
        self.assertIn('PRIVATE-REASON-A05', cells)
