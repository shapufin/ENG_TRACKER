"""SEC-16: report exports must neutralise user-controlled spreadsheet formulas."""
from datetime import date

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from apps.leave_management.models import LeaveRequest
from apps.overtime.models import Client, OvertimeLog
from apps.reports.models.core import AuditLog
from apps.reports.services.export_service import export_service
from core.utils.csv_injection_assert import (
    PAYLOAD,
    assert_csv_neutralised,
    assert_xlsx_neutralised,
)


class ReportExportFormulaInjectionTests(TestCase):
    def setUp(self):
        self.staff = User.objects.create_user(
            username='inj-staff', password='x', is_staff=True,
        )
        self.emp = User.objects.create_user(
            username='inj-emp', password='x', first_name=PAYLOAD, last_name='',
        )
        self.client_model = Client.objects.create(name='Inj Client', code='INJ')
        OvertimeLog.objects.create(
            user=self.emp, client=self.client_model, date=date(2026, 6, 1),
            hours=4, status='approved', description=PAYLOAD,
        )
        LeaveRequest.objects.create(
            user=self.emp, request_type='vacation', start_date=date(2026, 6, 10),
            end_date=date(2026, 6, 12), status='approved', reason=PAYLOAD,
        )
        self.api = APIClient()
        self.api.force_authenticate(self.staff)

    def test_export_excel_view(self):
        response = self.api.get('/api/reports/export-excel/', {'report_type': 'overtime'})
        self.assertEqual(response.status_code, 200, response.content[:200])
        assert_xlsx_neutralised(self, response.content)

    def test_export_service_ot_standby_description(self):
        content = export_service.export_ot_standby_to_excel(
            OvertimeLog.objects.filter(status='approved'), OvertimeLog.objects.none(),
        )
        assert_xlsx_neutralised(self, content)

    def test_export_service_leave_reason(self):
        content = export_service.export_leave_to_excel(
            LeaveRequest.objects.filter(status='approved'),
        )
        assert_xlsx_neutralised(self, content)

    def test_export_service_csv(self):
        text = export_service.export_to_csv([{'name': PAYLOAD, 'hours': -3}])
        assert_csv_neutralised(self, text)
        self.assertIn(',-3', text)  # numbers are left alone

    def test_audit_log_csv(self):
        AuditLog.objects.create(
            user=self.emp, action='CREATE', model_name='overtimelog',
            object_id='1', object_repr=PAYLOAD,
        )
        response = self.api.get('/api/reports/audit-logs/export/')
        self.assertEqual(response.status_code, 200)
        assert_csv_neutralised(self, b''.join(response.streaming_content))
