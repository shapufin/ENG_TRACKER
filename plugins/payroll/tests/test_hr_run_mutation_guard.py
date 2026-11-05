"""HR reads and exports payroll runs, but runs are changed only by the lifecycle or an administrator."""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role
from apps.plugins.models import PluginPermission
from plugins.payroll.models import (
    PayrollConfiguration,
    PayrollRuleSet,
    PayrollRun,
    WageAssignment,
)
from plugins.payroll.services.payroll_service import finalize_run, generate_draft_run

User = get_user_model()
BASE = '/api/plugins/payroll/runs/'


class HrRunMutationGuardTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        PayrollConfiguration.objects.update_or_create(
            pk=1, defaults={'require_tl_closed_before_finalize': False},
        )
        call_command('seed_payroll_rules', verbosity=0)
        hr_role, _ = Role.objects.get_or_create(code='hr', defaults={'name': 'HR'})
        for action in ('view', 'manage', 'export'):
            perm, _ = PluginPermission.objects.get_or_create(plugin_name='payroll', action=action)
            perm.allowed_roles.add(hr_role)
        cls.hr = User.objects.create_user('hr_guard', password='x')
        cls.hr.profile.is_hr_user = True
        cls.hr.profile.save(update_fields=['is_hr_user'])
        assign_role(cls.hr, 'hr')
        cls.admin = User.objects.create_user('admin_guard', password='x', is_staff=True)
        cls.employee = User.objects.create_user('emp_guard', password='x')
        WageAssignment.objects.create(
            user=cls.employee, gross_monthly_wage=Decimal('100000'),
            effective_from=date(2026, 1, 1), is_active=True,
        )

    def _draft(self):
        run = PayrollRun.objects.create(
            year=2026, month=3, status='draft', created_by=self.admin,
            rule_set=PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE'),
        )
        generate_draft_run(run, [self.employee])
        return run

    def _client(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def test_hr_cannot_change_a_run_by_hand(self):
        run = self._draft()
        client = self._client(self.hr)
        self.assertEqual(client.post(BASE, {'year': 2026, 'month': 4}, format='json').status_code, 403)
        for action in ('generate', 'finalize', 'cancel'):
            response = client.post(f'{BASE}{run.pk}/{action}/', {}, format='json')
            self.assertEqual(response.status_code, 403, action)
        self.assertEqual(
            client.post(f'{BASE}{run.pk}/generate_line/', {'user_id': self.employee.pk}, format='json').status_code,
            403,
        )
        self.assertEqual(client.delete(f'{BASE}{run.pk}/').status_code, 403)
        self.assertEqual(client.patch(f'{BASE}{run.pk}/', {'notes': 'x'}, format='json').status_code, 403)
        run.refresh_from_db()
        self.assertEqual(run.status, 'draft')
        self.assertEqual(run.lines.count(), 1)

    def test_hr_still_reads_the_draft_and_exports_a_finalized_run(self):
        run = self._draft()
        client = self._client(self.hr)
        self.assertEqual(client.get(f'{BASE}{run.pk}/').status_code, 200)
        self.assertEqual(client.get(f'{BASE}{run.pk}/lines/').status_code, 200)
        finalize_run(run, self.admin)
        self.assertEqual(client.get(f'{BASE}{run.pk}/export_excel/').status_code, 200)

    def test_administrator_can_still_finalize_by_hand(self):
        run = self._draft()
        response = self._client(self.admin).post(f'{BASE}{run.pk}/finalize/', {}, format='json')
        self.assertEqual(response.status_code, 200, response.data)

    def test_scope_tells_the_client_who_can_mutate(self):
        self.assertFalse(self._client(self.hr).get(f'{BASE}scope/').data['can_mutate_runs'])
        self.assertTrue(self._client(self.admin).get(f'{BASE}scope/').data['can_mutate_runs'])

    def test_hr_keeps_the_wage_management_grant(self):
        response = self._client(self.hr).get('/api/plugins/payroll/wages/')
        self.assertEqual(response.status_code, 200)
