"""runs/scope/ also answers the default year and the years to offer (plan Y4 D5)."""
from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from core.utils.timezone_local import business_today

User = get_user_model()
URL = '/api/plugins/payroll/runs/scope/'


class PayrollRunScopeYearsTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.admin = User.objects.create_superuser(
            username='ry_admin', email='ry@test.com', password='x',
        )
        self.api.force_authenticate(self.admin)

    def test_the_scope_carries_the_business_year(self):
        response = self.api.get(URL)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['business_year'], business_today().year)
        self.assertIn(response.data['run_scope'], ('company', 'team'))

    def test_the_business_year_is_always_offered(self):
        response = self.api.get(URL)
        self.assertIn(business_today().year, response.data['years'])

    def test_existing_run_years_are_offered_newest_first(self):
        from plugins.payroll.models import PayrollRuleSet, PayrollRun

        rule_set = PayrollRuleSet.objects.create(
            name='RY rules', effective_from=date(2020, 1, 1),
        )
        for year in (business_today().year - 3, business_today().year - 1):
            PayrollRun.objects.create(year=year, month=1, status='draft', rule_set=rule_set)

        response = self.api.get(URL)
        years = response.data['years']
        self.assertEqual(years, sorted(years, reverse=True))
        self.assertIn(business_today().year - 3, years)
        self.assertIn(business_today().year - 1, years)

    def test_the_scope_stays_scoped_to_the_viewer(self):
        """A plain employee does not gain the company scope from this change."""
        employee = User.objects.create_user(username='ry_emp', password='x')
        self.api.force_authenticate(employee)
        response = self.api.get(URL)
        # Either refused by the plugin gate or answered with the team scope —
        # never "company".
        if response.status_code == 200:
            self.assertNotEqual(response.data['run_scope'], 'company')
