"""Additional regression tests for Payroll audit findings."""
from datetime import date
from decimal import Decimal
import io

import openpyxl
from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from plugins.payroll.models import PayrollRuleSet, PayrollRun, WageAssignment
from plugins.payroll.services.export_service import generate_payroll_excel, generate_payslip_pdf
from plugins.payroll.services.payroll_service import generate_draft_run, finalize_run
from plugins.payroll.viewsets import PayrollConfigurationViewSet, PayrollRunViewSet

from django.contrib.auth import get_user_model

User = get_user_model()


class PayrollAdditionalRegressionTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser(
            username='audit_admin', email='audit@example.com', password='pass',
        )
        cls.employee = User.objects.create_user(
            username='audit_employee', email='employee@example.com', password='pass',
        )
        WageAssignment.objects.create(
            user=cls.employee,
            gross_monthly_wage=Decimal('100000'),
            effective_from=date(2026, 1, 1),
        )
        from django.core.management import call_command
        call_command('seed_payroll_rules', verbosity=0)

    def setUp(self):
        self.factory = APIRequestFactory()

    def _new_run(self, month):
        rule_set = PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE')
        run = PayrollRun.objects.create(
            year=2026, month=month, status='draft', rule_set=rule_set,
            created_by=self.admin,
        )
        generate_draft_run(run, [self.employee])
        return run

    def test_configuration_list_returns_singleton_object(self):
        request = self.factory.get('/api/plugins/payroll/configuration/')
        force_authenticate(request, user=self.admin)
        response = PayrollConfigurationViewSet.as_view({'get': 'list'})(request)
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.data, dict)
        self.assertEqual(response.data['id'], 1)

    def test_overlapping_wages_are_rejected_during_resolution(self):
        WageAssignment.objects.create(
            user=self.employee,
            gross_monthly_wage=Decimal('110000'),
            effective_from=date(2026, 2, 1),
        )
        with self.assertRaises(ValidationError):
            WageAssignment.resolve_for_month(self.employee, 2026, 2)

    def test_finalized_run_cannot_be_updated_or_deleted(self):
        run = self._new_run(8)
        finalize_run(run, self.admin)

        update_request = self.factory.patch(
            f'/api/plugins/payroll/runs/{run.id}/', {'notes': 'tamper'}, format='json',
        )
        force_authenticate(update_request, user=self.admin)
        update_response = PayrollRunViewSet.as_view({'patch': 'partial_update'})(
            update_request, pk=run.id,
        )
        self.assertEqual(update_response.status_code, 409)

        delete_request = self.factory.delete(f'/api/plugins/payroll/runs/{run.id}/')
        force_authenticate(delete_request, user=self.admin)
        delete_response = PayrollRunViewSet.as_view({'delete': 'destroy'})(
            delete_request, pk=run.id,
        )
        self.assertEqual(delete_response.status_code, 409)

    def test_payslip_pdf_contains_pdf_signature(self):
        run = self._new_run(9)
        run = finalize_run(run, self.admin)
        line = run.lines.get(user=self.employee)
        payload = generate_payslip_pdf(line)
        # generate_payslip_pdf returns a BytesIO stream
        self.assertTrue(payload.read(5).startswith(b'%PDF'))

    def test_excel_export_escapes_formula_like_employee_name(self):
        self.employee.first_name = '=1+1'
        self.employee.save(update_fields=['first_name'])
        run = self._new_run(11)

        workbook = openpyxl.load_workbook(io.BytesIO(generate_payroll_excel(run).read()))

        self.assertEqual(workbook['Employee Breakdown']['A2'].value, "'=1+1")
        self.assertEqual(workbook['Overtime Detail']['A2'].value, "'=1+1")

    def test_active_run_uniqueness_rejects_second_draft(self):
        rule_set = PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE')
        PayrollRun.objects.create(
            year=2026, month=10, status='draft', rule_set=rule_set,
            created_by=self.admin,
        )
        with self.assertRaises(Exception):
            PayrollRun.objects.create(
                year=2026, month=10, status='draft', rule_set=rule_set,
                created_by=self.admin,
            )
