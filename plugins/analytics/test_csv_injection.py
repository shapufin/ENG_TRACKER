"""SEC-16: analytics XLSX/CSV reports must neutralise spreadsheet formulas."""
from datetime import date

from django.contrib.auth.models import User
from django.test import TestCase

from apps.overtime.models import Client, OvertimeLog
from core.utils.csv_injection_assert import (
    PAYLOAD,
    assert_csv_neutralised,
    assert_xlsx_neutralised,
)
from plugins.analytics.reports import AnalyticsReportGenerator


class AnalyticsReportFormulaInjectionTests(TestCase):
    def setUp(self):
        user = User.objects.create_user(
            username='an-inj', password='x', first_name=PAYLOAD, last_name='',
        )
        OvertimeLog.objects.create(
            user=user, client=Client.objects.create(name='C', code='C1'),
            date=date(2026, 6, 1), hours=2, status='approved', description=PAYLOAD,
        )
        self.kwargs = {
            'period': 'month', 'date_from': '2026-06-01', 'date_to': '2026-06-30',
        }

    def test_excel_report(self):
        content = AnalyticsReportGenerator.generate_excel_report(**self.kwargs)
        assert_xlsx_neutralised(self, content)

    def test_csv_report(self):
        text = AnalyticsReportGenerator.generate_csv_report(**self.kwargs)
        assert_csv_neutralised(self, text)
