"""SEC-16: ticket KPI yearly exports must neutralise spreadsheet formulas."""
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from core.utils.csv_injection_assert import (
    PAYLOAD,
    assert_csv_neutralised,
    assert_xlsx_neutralised,
)
from plugins.ticket_kpi.viewsets import TicketKPIReportViewSet

# What compute_yearly_summary returns for one user whose display name is
# user-controlled (first_name/last_name), kept inline so the test targets the
# writer and not the analytics query.
_SUMMARY = {
    'year': 2026,
    'users_with_data': 1,
    'total_tickets': 3,
    'monthly_breakdown': [{'month': '2026-01', 'total_tickets': 3}],
    'per_user_summary': [{
        'user_id': 1, 'username': 'kpi-user', 'name': PAYLOAD, 'total_tickets': 3,
    }],
}


class TicketKpiExportFormulaInjectionTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(username='kpi-adm', email='a@e.com', password='x')

    def _call(self, action):
        request = APIRequestFactory().get(f'/reports/{action}/', {'year': 2026})
        force_authenticate(request, self.admin)
        with patch('plugins.ticket_kpi.viewsets.compute_yearly_summary', return_value=_SUMMARY):
            return TicketKPIReportViewSet.as_view({'get': action})(request)

    def test_export_csv(self):
        response = self._call('export_csv')
        self.assertEqual(response.status_code, 200)
        assert_csv_neutralised(self, response.content)

    def test_export_excel(self):
        response = self._call('export_excel')
        self.assertEqual(response.status_code, 200)
        assert_xlsx_neutralised(self, response.content)
