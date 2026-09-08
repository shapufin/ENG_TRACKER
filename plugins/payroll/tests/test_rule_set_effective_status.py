"""Effective-status annotation for payroll rule sets.

The list endpoint must expose an `effective_status` field derived from
effective-date logic (mirroring `PayrollRuleSet.resolve_for_date`) so the
UI can distinguish the currently-effective rule set from superseded,
upcoming, and inactive ones — even when multiple rows share `is_active=True`.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from plugins.payroll.models import PayrollRuleSet, PayrollTaxBracket
from plugins.payroll.viewsets import PayrollRuleSetViewSet

User = get_user_model()


class PayrollRuleSetEffectiveStatusTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_superuser(
            username='status_admin', email='status@example.com', password='pass',
        )
        self.factory = APIRequestFactory()
        self.today = date.today()

    def _make_rule_set(self, code, effective_from, effective_to=None, is_active=True, tax_profile='standard'):
        rs = PayrollRuleSet.objects.create(
            code=code, name=code, version='1.0',
            effective_from=effective_from, effective_to=effective_to,
            is_active=is_active, tax_profile=tax_profile,
        )
        PayrollTaxBracket.objects.create(
            rule_set=rs, lower_bound=Decimal('0'), upper_bound=None,
            rate=Decimal('0.1'), order=0,
        )
        return rs

    def _list(self):
        request = self.factory.get('/rule-sets/')
        force_authenticate(request, user=self.user)
        response = PayrollRuleSetViewSet.as_view({'get': 'list'})(request)
        response.render()
        return response.data

    def _status_by_code(self, data):
        return {row['code']: row['effective_status'] for row in data['results']}

    def test_current_when_single_active_open_ended(self):
        self._make_rule_set('SINGLE', effective_from=self.today - timedelta(days=30))
        statuses = self._status_by_code(self._list())
        self.assertEqual(statuses['SINGLE'], 'current')

    def test_superseded_when_newer_active_covers_today(self):
        self._make_rule_set('OLD_OPEN', effective_from=self.today - timedelta(days=300))
        self._make_rule_set('NEW_OPEN', effective_from=self.today - timedelta(days=10))
        statuses = self._status_by_code(self._list())
        self.assertEqual(statuses['NEW_OPEN'], 'current')
        self.assertEqual(statuses['OLD_OPEN'], 'superseded')

    def test_upcoming_when_effective_from_in_future(self):
        self._make_rule_set('FUTURE', effective_from=self.today + timedelta(days=20))
        statuses = self._status_by_code(self._list())
        self.assertEqual(statuses['FUTURE'], 'upcoming')

    def test_inactive_when_is_active_false(self):
        self._make_rule_set('OFF', effective_from=self.today - timedelta(days=30), is_active=False)
        statuses = self._status_by_code(self._list())
        self.assertEqual(statuses['OFF'], 'inactive')

    def test_current_when_window_covers_today_and_no_newer(self):
        self._make_rule_set(
            'WINDOWED',
            effective_from=self.today - timedelta(days=60),
            effective_to=self.today + timedelta(days=10),
        )
        statuses = self._status_by_code(self._list())
        self.assertEqual(statuses['WINDOWED'], 'current')

    def test_superseded_when_windowed_and_newer_open_covers_today(self):
        self._make_rule_set(
            'OLD_WINDOWED',
            effective_from=self.today - timedelta(days=300),
            effective_to=self.today + timedelta(days=300),
        )
        self._make_rule_set('NEW_OPEN', effective_from=self.today - timedelta(days=5))
        statuses = self._status_by_code(self._list())
        self.assertEqual(statuses['NEW_OPEN'], 'current')
        self.assertEqual(statuses['OLD_WINDOWED'], 'superseded')

    def test_expired_active_set_before_today_window_is_superseded(self):
        # Active set whose window ended before today, no newer set covering today.
        # It is active but not current and not upcoming -> superseded.
        self._make_rule_set(
            'EXPIRED',
            effective_from=self.today - timedelta(days=300),
            effective_to=self.today - timedelta(days=10),
        )
        statuses = self._status_by_code(self._list())
        self.assertEqual(statuses['EXPIRED'], 'superseded')

    def test_tax_profiles_evaluated_independently(self):
        self._make_rule_set('STD_OLD', effective_from=self.today - timedelta(days=300), tax_profile='standard')
        self._make_rule_set('STD_NEW', effective_from=self.today - timedelta(days=5), tax_profile='standard')
        self._make_rule_set('CAT6', effective_from=self.today - timedelta(days=30), tax_profile='category_6')
        statuses = self._status_by_code(self._list())
        self.assertEqual(statuses['STD_NEW'], 'current')
        self.assertEqual(statuses['STD_OLD'], 'superseded')
        self.assertEqual(statuses['CAT6'], 'current')
