"""Focused API coverage for immutable, versioned payroll rules."""
from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from plugins.payroll.models import (
    PayrollContributionRate,
    PayrollRuleSet,
    PayrollTaxBracket,
    PayrollRun,
)
from plugins.payroll.serializers import PayrollOvertimeCategorySerializer, PayrollTaxBracketSerializer
from plugins.payroll.viewsets import PayrollRuleSetViewSet, _log_audit

from django.contrib.auth import get_user_model


class PayrollRuleSetCrudTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_superuser(
            username='rules_admin', email='rules@example.com', password='pass',
        )
        self.factory = APIRequestFactory()
        self.rule_set = PayrollRuleSet.objects.create(
            code='TEST_2026_V1', name='Test rules', version='1.0',
            effective_from=date(2026, 1, 1),
        )
        PayrollTaxBracket.objects.create(
            rule_set=self.rule_set, lower_bound=0, upper_bound=Decimal('1000'),
            rate=Decimal('0.1'), order=0,
        )
        PayrollTaxBracket.objects.create(
            rule_set=self.rule_set, lower_bound=Decimal('1000'), upper_bound=None,
            rate=Decimal('0.2'), order=1,
        )
        PayrollContributionRate.objects.create(
            rule_set=self.rule_set, contribution_type='social', side='employee',
            rate=Decimal('0.1'), cap=Decimal('1000'), floor=Decimal('100'),
        )

    def request(self, method, path, data=None, action='retrieve', **kwargs):
        request = getattr(self.factory, method)(path, data=data, format='json')
        force_authenticate(request, user=self.user)
        return PayrollRuleSetViewSet.as_view({method: action})(request, **kwargs)

    def test_referenced_rule_set_cannot_be_updated(self):
        PayrollRun.objects.create(year=2026, month=1, rule_set=self.rule_set)
        response = self.request('patch', '/rule-sets/1/', {'name': 'Changed'}, action='partial_update', pk=self.rule_set.pk)
        self.assertEqual(response.status_code, 400)
        self.assertIn('immutable', str(response.data).lower())

    def test_clone_copies_children_with_new_identity(self):
        response = self.request(
            'post', '/rule-sets/1/clone/',
            {'code': 'TEST_2026_V2', 'version': '2.0', 'effective_from': '2026-07-01'},
            action='clone', pk=self.rule_set.pk,
        )
        self.assertEqual(response.status_code, 201)
        clone = PayrollRuleSet.objects.get(code='TEST_2026_V2')
        self.assertEqual(clone.tax_brackets.count(), 2)
        self.assertEqual(clone.contribution_rates.count(), 1)
        self.assertNotEqual(clone.pk, self.rule_set.pk)

    def test_create_rejects_duplicate_active_effective_date(self):
        response = self.request(
            'post', '/rule-sets/',
            {
                'code': 'TEST_DUPLICATE_CREATE', 'name': 'Duplicate create', 'version': '2.0',
                'country': 'AL', 'effective_from': '2026-01-01', 'is_active': True,
                'tax_profile': 'standard',
            },
            action='create',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('effective date', str(response.data).lower())
        self.assertFalse(PayrollRuleSet.objects.filter(code='TEST_DUPLICATE_CREATE').exists())

    def test_clone_rejects_duplicate_active_effective_date(self):
        response = self.request(
            'post', '/rule-sets/1/clone/',
            {'code': 'TEST_DUPLICATE_CLONE', 'version': '2.0', 'effective_from': '2026-01-01'},
            action='clone', pk=self.rule_set.pk,
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('effective date', str(response.data).lower())
        self.assertFalse(PayrollRuleSet.objects.filter(code='TEST_DUPLICATE_CLONE').exists())

    def test_resolver_uses_latest_effective_date(self):
        later = PayrollRuleSet.objects.create(
            code='TEST_LATER', name='Later rules', version='2.0',
            effective_from=date(2026, 7, 1),
        )
        resolved = PayrollRuleSet.resolve_for_date(date(2026, 8, 1))
        self.assertEqual(resolved.pk, later.pk)

    def _atomic_payload(self, **overrides):
        parent = {
            'code': self.rule_set.code,
            'name': self.rule_set.name,
            'version': self.rule_set.version,
            'country': self.rule_set.country,
            'effective_from': self.rule_set.effective_from.isoformat(),
            'effective_to': None,
            'is_active': True,
            'tax_profile': self.rule_set.tax_profile,
            'source': self.rule_set.source,
            'notes': self.rule_set.notes,
            'validation_status': self.rule_set.validation_status,
        }
        parent.update(overrides.pop('parent_fields', {}))
        payload = {
            'mode': 'edit',
            'expected_updated_at': self.rule_set.updated_at.isoformat(),
            'parent_fields': parent,
            'tax_brackets': [
                {
                    'id': bracket.id,
                    'lower_bound': str(bracket.lower_bound),
                    'upper_bound': str(bracket.upper_bound) if bracket.upper_bound is not None else None,
                    'rate': str(bracket.rate),
                    'fixed_amount': str(bracket.fixed_amount),
                    'order': bracket.order,
                }
                for bracket in self.rule_set.tax_brackets.all()
            ],
            'contribution_rates': [
                {
                    'id': rate.id,
                    'contribution_type': rate.contribution_type,
                    'side': rate.side,
                    'rate': str(rate.rate),
                    'cap': str(rate.cap) if rate.cap is not None else None,
                    'floor': str(rate.floor) if rate.floor is not None else None,
                }
                for rate in self.rule_set.contribution_rates.all()
            ],
            'overtime_categories': [],
            **overrides,
        }
        if payload['mode'] == 'version':
            for group in ('tax_brackets', 'contribution_rates', 'overtime_categories'):
                for child in payload[group]:
                    child.pop('id', None)
        return payload

    def test_atomic_edit_updates_name_and_reconciles_children(self):
        payload = self._atomic_payload(
            parent_fields={'name': 'Updated rules'},
            overtime_categories=[
                {
                    'code': 'weekday_day', 'multiplier': '1.25',
                    'night_start_hour': None, 'night_end_hour': None,
                    'applies_weekend': False, 'applies_holiday': False, 'order': 0,
                },
            ],
        )
        response = self.request('post', '/rule-sets/1/atomic-save/', payload, action='atomic_save', pk=self.rule_set.pk)
        self.assertEqual(response.status_code, 200)
        self.rule_set.refresh_from_db()
        self.assertEqual(self.rule_set.name, 'Updated rules')
        self.assertEqual(self.rule_set.overtime_categories.count(), 1)
        self.assertEqual(self.rule_set.overtime_categories.first().multiplier, Decimal('1.25'))
        self.assertTrue(response.data['has_payroll_runs'] is False)

    def test_atomic_edit_rolls_back_parent_when_child_is_invalid(self):
        payload = self._atomic_payload(parent_fields={'name': 'Should roll back'})
        payload['tax_brackets'][1]['lower_bound'] = '2000'
        response = self.request('post', '/rule-sets/1/atomic-save/', payload, action='atomic_save', pk=self.rule_set.pk)
        self.assertEqual(response.status_code, 400)
        self.rule_set.refresh_from_db()
        self.assertEqual(self.rule_set.name, 'Test rules')

    def test_atomic_edit_deletes_children_omitted_from_final_payload(self):
        payload = self._atomic_payload()
        payload['tax_brackets'] = []
        payload['contribution_rates'] = []
        response = self.request('post', '/rule-sets/1/atomic-save/', payload, action='atomic_save', pk=self.rule_set.pk)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.rule_set.tax_brackets.count(), 0)
        self.assertEqual(self.rule_set.contribution_rates.count(), 0)

    def test_atomic_edit_rejects_foreign_child_id(self):
        PayrollRuleSet.objects.create(
            code='OTHER_2026', name='Other', version='1.0', effective_from=date(2026, 2, 1),
        )
        payload = self._atomic_payload()
        payload['tax_brackets'][0]['id'] = 9999
        response = self.request('post', '/rule-sets/1/atomic-save/', payload, action='atomic_save', pk=self.rule_set.pk)
        self.assertEqual(response.status_code, 400)
        self.assertIn('does not belong', str(response.data))

    def test_atomic_version_rejects_duplicate_effective_date(self):
        PayrollRuleSet.objects.create(
            code='OTHER_ACTIVE_2026', name='Other active', version='1.0', effective_from=date(2026, 7, 1),
        )
        payload = self._atomic_payload(
            mode='version',
            parent_fields={
                'code': 'TEST_DUPLICATE_DATE', 'version': '2.0', 'effective_from': '2026-07-01',
            },
        )
        response = self.request('post', '/rule-sets/1/atomic-save/', payload, action='atomic_save', pk=self.rule_set.pk)
        self.assertEqual(response.status_code, 400)
        self.assertIn('already uses this effective date', str(response.data))

    def test_atomic_edit_rejects_referenced_rule_set(self):
        PayrollRun.objects.create(year=2026, month=1, rule_set=self.rule_set)
        payload = self._atomic_payload(parent_fields={'name': 'No change'})
        response = self.request('post', '/rule-sets/1/atomic-save/', payload, action='atomic_save', pk=self.rule_set.pk)
        self.assertEqual(response.status_code, 400)
        self.assertIn('immutable', str(response.data).lower())

    def test_atomic_version_preserves_source_and_creates_new_children(self):
        payload = self._atomic_payload(
            mode='version',
            parent_fields={
                'code': 'TEST_2026_V3', 'name': 'New rules', 'version': '3.0',
                'effective_from': '2027-01-01',
            },
        )
        payload['mode'] = 'version'
        response = self.request('post', '/rule-sets/1/atomic-save/', payload, action='atomic_save', pk=self.rule_set.pk)
        self.assertEqual(response.status_code, 201)
        clone = PayrollRuleSet.objects.get(code='TEST_2026_V3')
        self.assertEqual(clone.tax_brackets.count(), 2)
        self.assertEqual(clone.contribution_rates.count(), 1)
        self.assertNotEqual(clone.tax_brackets.first().pk, self.rule_set.tax_brackets.first().pk)
        self.assertEqual(self.rule_set.name, 'Test rules')

    def test_atomic_save_rejects_stale_updated_at(self):
        payload = self._atomic_payload(expected_updated_at='2020-01-01T00:00:00Z')
        response = self.request('post', '/rule-sets/1/atomic-save/', payload, action='atomic_save', pk=self.rule_set.pk)
        self.assertEqual(response.status_code, 400)
        self.assertIn('changed in another window', str(response.data))

    @patch('plugins.audit_log.signals.log_action')
    def test_atomic_edit_logs_complete_old_and_new_values(self, log_action):
        payload = self._atomic_payload(parent_fields={'name': 'Audited rules'})
        response = self.request('post', '/rule-sets/1/atomic-save/', payload, action='atomic_save', pk=self.rule_set.pk)
        self.assertEqual(response.status_code, 200)
        audit = log_action.call_args.kwargs
        self.assertEqual(audit['action'], 'payroll_ruleset_update')
        self.assertEqual(audit['old_values']['name'], 'Test rules')
        self.assertEqual(audit['new_values']['name'], 'Audited rules')
        self.assertIn('tax_brackets', audit['old_values'])
        self.assertIn('tax_brackets', audit['new_values'])

    @patch('plugins.audit_log.signals.log_action')
    def test_atomic_version_logs_version_action(self, log_action):
        payload = self._atomic_payload(
            mode='version',
            parent_fields={
                'code': 'TEST_AUDITED_V2', 'version': '2.0', 'effective_from': '2027-01-01',
            },
        )
        payload['mode'] = 'version'
        for group in ('tax_brackets', 'contribution_rates', 'overtime_categories'):
            for child in payload[group]:
                child.pop('id', None)
        response = self.request('post', '/rule-sets/1/atomic-save/', payload, action='atomic_save', pk=self.rule_set.pk)
        self.assertEqual(response.status_code, 201)
        audit = log_action.call_args.kwargs
        self.assertEqual(audit['action'], 'payroll_ruleset_version_save')
        self.assertEqual(audit['old_values']['code'], 'TEST_2026_V1')
        self.assertEqual(audit['new_values']['code'], 'TEST_AUDITED_V2')

    def test_atomic_save_rejects_percentage_over_100(self):
        payload = self._atomic_payload()
        payload['tax_brackets'][0]['rate'] = '1.01'
        response = self.request('post', '/rule-sets/1/atomic-save/', payload, action='atomic_save', pk=self.rule_set.pk)
        self.assertEqual(response.status_code, 400)
        self.assertIn('100%', str(response.data))

    def test_child_serializers_reject_invalid_values(self):
        bracket = PayrollTaxBracketSerializer(data={'lower_bound': '10', 'upper_bound': '5', 'rate': '0'})
        self.assertFalse(bracket.is_valid())
        overtime = PayrollOvertimeCategorySerializer(data={'multiplier': '-1', 'night_start_hour': 24})
        self.assertFalse(overtime.is_valid())

    @patch('plugins.audit_log.signals.log_action')
    def test_audit_payload_converts_decimals_to_strings(self, log_action):
        _log_audit(self.user, 'rule_mutation', 'test', new_values={'rate': Decimal('0.125')})
        payload = log_action.call_args.kwargs
        self.assertEqual(payload['new_values']['rate'], '0.125')
