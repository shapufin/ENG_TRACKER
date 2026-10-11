"""Payroll generate/create skip users without a wage for the month, and never
include superusers (plan Phase 1, decision D2)."""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from plugins.payroll.models import PayrollLine, PayrollRun, PayrollRuleSet, WageAssignment
from plugins.payroll.viewsets import PayrollRunViewSet

User = get_user_model()


class PayrollGenerateSkipTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.requester = User.objects.create_superuser(
            username='skip_requester', email='skip_requester@test.com', password='pass',
        )
        cls.waged = User.objects.create_user(username='skip_waged', password='pass')
        WageAssignment.objects.create(
            user=cls.waged,
            gross_monthly_wage=Decimal('100000'),
            effective_from=date(2026, 1, 1),
            is_active=True,
        )
        # Wage starts after August 2026, so it does not cover the run month.
        cls.late_wage = User.objects.create_user(username='skip_late_wage', password='pass')
        WageAssignment.objects.create(
            user=cls.late_wage,
            gross_monthly_wage=Decimal('90000'),
            effective_from=date(2026, 9, 20),
            is_active=True,
        )
        cls.wageless = User.objects.create_user(username='skip_wageless', password='pass')
        cls.superuser_with_wage = User.objects.create_superuser(
            username='skip_superuser_wage', email='skip_su@test.com', password='pass',
        )
        WageAssignment.objects.create(
            user=cls.superuser_with_wage,
            gross_monthly_wage=Decimal('120000'),
            effective_from=date(2026, 1, 1),
            is_active=True,
        )
        call_command('seed_payroll_rules', verbosity=0)

    def setUp(self):
        self.factory = APIRequestFactory()
        self.rule_set = PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE')

    def _draft_run(self, month=8):
        return PayrollRun.objects.create(
            year=2026, month=month, status='draft', rule_set=self.rule_set,
            created_by=self.requester,
        )

    def _generate(self, run, body=None):
        request = self.factory.post(
            f'/api/plugins/payroll/runs/{run.id}/generate/', body or {}, format='json',
        )
        force_authenticate(request, user=self.requester)
        return PayrollRunViewSet.as_view({'post': 'generate'})(request, pk=run.id)

    def test_generate_skips_user_whose_wage_starts_after_month(self):
        run = self._draft_run()
        response = self._generate(run, {'user_ids': [self.waged.id, self.late_wage.id]})

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['line_count'], 1)
        self.assertEqual(
            response.data['skipped_users'],
            [{
                'user_id': self.late_wage.id,
                'username': self.late_wage.username,
                'reason': f'No active wage assignment for {self.late_wage.username} in 2026-08.',
            }],
        )
        included = set(run.lines.values_list('user_id', flat=True))
        self.assertEqual(included, {self.waged.id})

    def test_generate_never_includes_superusers(self):
        run = self._draft_run()
        response = self._generate(
            run, {'user_ids': [self.waged.id, self.superuser_with_wage.id]},
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['line_count'], 1)
        self.assertEqual(response.data['skipped_users'], [])
        self.assertFalse(run.lines.filter(user=self.superuser_with_wage).exists())

    def test_generate_with_wageless_member_skips_instead_of_400(self):
        run = self._draft_run()
        response = self._generate(run, {'user_ids': [self.waged.id, self.wageless.id]})

        self.assertEqual(response.status_code, 200, response.data)
        skipped_ids = [row['user_id'] for row in response.data['skipped_users']]
        self.assertEqual(skipped_ids, [self.wageless.id])
        self.assertTrue(run.lines.filter(user=self.waged).exists())

    def test_create_run_reports_skipped_users(self):
        request = self.factory.post('/api/plugins/payroll/runs/', {
            'year': 2026, 'month': 8,
            'user_ids': [self.waged.id, self.late_wage.id],
        }, format='json')
        force_authenticate(request, user=self.requester)
        response = PayrollRunViewSet.as_view({'post': 'create'})(request)

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(
            [row['user_id'] for row in response.data['skipped_users']],
            [self.late_wage.id],
        )
        self.assertIn('id', response.data)

    def test_generate_line_returns_real_reason_for_wageless_user(self):
        run = self._draft_run()
        request = self.factory.post(
            f'/api/plugins/payroll/runs/{run.id}/generate_line/',
            {'user_id': self.wageless.id}, format='json',
        )
        force_authenticate(request, user=self.requester)
        response = PayrollRunViewSet.as_view({'post': 'generate_line'})(request, pk=run.id)

        self.assertEqual(response.status_code, 400)
        self.assertIn('No active wage assignment', response.data['detail'])

    def test_generate_line_refuses_superuser(self):
        run = self._draft_run()
        request = self.factory.post(
            f'/api/plugins/payroll/runs/{run.id}/generate_line/',
            {'user_id': self.superuser_with_wage.id}, format='json',
        )
        force_authenticate(request, user=self.requester)
        response = PayrollRunViewSet.as_view({'post': 'generate_line'})(request, pk=run.id)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['detail'], 'Superuser accounts are not payroll subjects.')
        self.assertFalse(PayrollLine.objects.filter(run=run, user=self.superuser_with_wage).exists())
