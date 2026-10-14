"""SEC-16: the audit log CSV export must neutralise spreadsheet formulas."""
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from core.utils.csv_injection_assert import PAYLOAD, assert_csv_neutralised
from plugins.audit_log.models import AuditLog
from plugins.audit_log.viewsets import AuditLogViewSet


class AuditLogExportFormulaInjectionTests(TestCase):
    def test_description_is_neutralised(self):
        admin = User.objects.create_superuser(username='adm', email='a@e.com', password='x')
        AuditLog.objects.create(user=admin, action='create', description=PAYLOAD, status='success')
        request = APIRequestFactory().get('/api/plugins/audit_log/logs/export/')
        force_authenticate(request, user=admin)
        response = AuditLogViewSet.as_view({'get': 'export'})(request)
        self.assertEqual(response.status_code, 200)
        assert_csv_neutralised(self, response.content)
