"""Draft regeneration must not destroy lines it did not rebuild.

* A scoped regenerate replaces only the lines and draft entries of the users it
  rebuilds; other users' lines survive and the run totals are recomputed from
  what remains.
* A regenerate with no payable users returns 400 and leaves the draft intact.
"""
from datetime import date
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from plugins.payroll.models import PayrollLine, PayrollRun, PayrollRuleSet, WageAssignment
from plugins.payroll.services.payroll_service import generate_draft_run
from plugins.payroll.viewsets import PayrollRunViewSet

User = get_user_model()


class ScopedRegenerateTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.requester = User.objects.create_superuser(
            username='regen_requester', email='regen_requester@test.com', password='pass',
        )
        cls.in_scope = User.objects.create_user(username='regen_in_scope', password='pass')
        cls.out_of_scope = User.objects.create_user(username='regen_out_of_scope', password='pass')
        cls.wageless = User.objects.create_user(username='regen_wageless', password='pass')
        cls.superuser_with_wage = User.objects.create_superuser(
            username='regen_su_wage', email='regen_su@test.com', password='pass',
        )
        for user, wage in ((cls.in_scope, '100000'), (cls.out_of_scope, '150000'),
                           (cls.superuser_with_wage, '120000')):
            WageAssignment.objects.create(
                user=user, gross_monthly_wage=Decimal(wage),
                effective_from=date(2026, 1, 1), is_active=True,
            )
        call_command('seed_payroll_rules', verbosity=0)
        cls.rule_set = PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE')

    def setUp(self):
        self.factory = APIRequestFactory()
        self.run = PayrollRun.objects.create(
            year=2026, month=8, status='draft', rule_set=self.rule_set,
            created_by=self.requester,
        )
        generate_draft_run(self.run, [self.in_scope, self.out_of_scope])
        self.out_line_id = self.run.lines.get(user=self.out_of_scope).id

    def _post_generate(self, body):
        request = self.factory.post(
            f'/api/plugins/payroll/runs/{self.run.id}/generate/', body, format='json',
        )
        force_authenticate(request, user=self.requester)
        return PayrollRunViewSet.as_view({'post': 'generate'})(request, pk=self.run.id)

    def test_service_scoped_regenerate_keeps_out_of_scope_line_and_entries(self):
        out_entries_before = self.run.source_entries.filter(user=self.out_of_scope).count()
        generate_draft_run(
            self.run, [self.in_scope], replace_user_ids={self.in_scope.id},
        )

        self.assertTrue(PayrollLine.objects.filter(pk=self.out_line_id).exists())
        self.assertEqual(
            self.run.source_entries.filter(user=self.out_of_scope).count(), out_entries_before,
        )
        self.assertEqual(self.run.lines.count(), 2)
        self.assertEqual(self.run.lines.get(user=self.in_scope).gross_monthly_wage, Decimal('100000'))

    def test_scoped_regenerate_keeps_run_totals_consistent_with_remaining_lines(self):
        generate_draft_run(
            self.run, [self.in_scope], replace_user_ids={self.in_scope.id},
        )
        self.run.refresh_from_db()
        remaining = self.run.lines.all()
        self.assertEqual(self.run.totals['line_count'], remaining.count())
        self.assertEqual(
            Decimal(self.run.totals['total_net']),
            sum((line.net_pay for line in remaining), Decimal('0')),
        )

    def test_view_scoped_regenerate_passes_scope_and_preserves_other_teams(self):
        with mock.patch(
            'plugins.payroll.viewsets._allowed_payroll_user_ids',
            return_value={self.in_scope.id},
        ):
            response = self._post_generate({'user_ids': [self.in_scope.id]})

        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(PayrollLine.objects.filter(pk=self.out_line_id).exists())
        self.assertEqual(response.data['line_count'], 1)
        self.assertEqual(self.run.lines.count(), 2)

    def test_all_skipped_regenerate_returns_400_and_keeps_draft(self):
        lines_before = set(self.run.lines.values_list('id', flat=True))
        response = self._post_generate(
            {'user_ids': [self.wageless.id, self.superuser_with_wage.id]},
        )

        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(
            [item['user_id'] for item in response.data['skipped_users']], [self.wageless.id],
        )
        self.assertEqual(set(self.run.lines.values_list('id', flat=True)), lines_before)
