"""PERF-04/05: payroll run list and work-calendar list query budgets.

Company scope (staff/HR) must be flat in the number of runs. Team scope
recomputes the run totals from the viewer's own lines, which costs exactly one
grouped aggregate per run row (runs are one per month, so a page is bounded);
that is pinned at <= 1 extra query per extra run.
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIRequestFactory, force_authenticate

from plugins.payroll.models import (
    PayrollConfiguration, PayrollRuleSet, PayrollRun, PayrollWorkCalendar, PayrollWorkday, WageAssignment,
)
from plugins.payroll.services.payroll_service import generate_draft_run
from plugins.payroll.viewsets import PayrollRunViewSet, PayrollWorkCalendarViewSet

User = get_user_model()


class PayrollRunListBudgetTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        PayrollConfiguration.objects.update_or_create(pk=1, defaults={'require_tl_closed_before_finalize': False})
        from apps.permissions.models import Role
        from apps.permissions.services.role_service import assign_role
        from apps.plugins.models import PluginPermission

        cls.admin = User.objects.create_superuser(username='pb_admin', email='pb@test.com', password='pass')
        tl_role, _ = Role.objects.get_or_create(code='team_leader', defaults={'name': 'Team Leader'})
        perm, _ = PluginPermission.objects.get_or_create(plugin_name='payroll', action='view')
        perm.allowed_roles.add(tl_role)
        cls.tl = User.objects.create_user(username='pb_tl', password='pass')
        assign_role(cls.tl, 'team_leader')
        cls.mine = User.objects.create_user(username='pb_mine', password='pass')
        cls.mine.profile.italian_tl = cls.tl
        cls.mine.profile.save(update_fields=['italian_tl'])
        cls.other = User.objects.create_user(username='pb_other', password='pass')
        for user in (cls.mine, cls.other):
            WageAssignment.objects.create(
                user=user, gross_monthly_wage=Decimal('100000'),
                effective_from=date(2026, 1, 1), is_active=True,
            )
        call_command('seed_payroll_rules', verbosity=0)
        cls.rule_set = PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE')

    def _runs_up_to(self, n):
        for month in range(1, n + 1):
            if PayrollRun.objects.filter(year=2026, month=month).exists():
                continue
            run = PayrollRun.objects.create(
                year=2026, month=month, status='draft', rule_set=self.rule_set, created_by=self.admin,
            )
            generate_draft_run(run, [self.mine, self.other])

    def _list(self, user):
        request = APIRequestFactory().get('/api/plugins/payroll/runs/')
        force_authenticate(request, user=user)
        with CaptureQueriesContext(connection) as ctx:
            resp = PayrollRunViewSet.as_view({'get': 'list'})(request)
            resp.render()
        self.assertEqual(resp.status_code, 200, getattr(resp, 'data', None))
        rows = resp.data['results'] if isinstance(resp.data, dict) else resp.data
        return len(ctx.captured_queries), rows

    def test_company_scope_is_flat_and_counts_all_lines(self):
        self._runs_up_to(1)
        one, rows_one = self._list(self.admin)
        self._runs_up_to(5)
        five, rows_five = self._list(self.admin)
        self.assertEqual(len(rows_five), 5)
        self.assertEqual({r['line_count'] for r in rows_five}, {2})
        self.assertEqual(one, five, f'N+1 on run list: {one} vs {five}')

    def test_team_scope_counts_and_totals_only_own_lines(self):
        self._runs_up_to(5)
        _, rows = self._list(self.tl)
        self.assertEqual(len(rows), 5)
        self.assertEqual({r['line_count'] for r in rows}, {1})
        for row in rows:
            self.assertEqual(row['totals']['line_count'], 1)

    def test_team_scope_costs_at_most_one_query_per_extra_run(self):
        self._runs_up_to(1)
        one, _ = self._list(self.tl)
        self._runs_up_to(5)
        five, _ = self._list(self.tl)
        self.assertLessEqual(five - one, 4, f'{one} -> {five}')


class WorkCalendarListBudgetTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(username='wc_admin', email='wc@test.com', password='pass')
        self.year = 2000

    def _calendar(self):
        self.year += 1
        cal = PayrollWorkCalendar.objects.create(country='AL', year=self.year)
        PayrollWorkday.objects.create(calendar=cal, date=date(self.year, 1, 1), is_working_day=False)
        PayrollWorkday.objects.create(calendar=cal, date=date(self.year, 1, 2), is_working_day=True)
        PayrollWorkday.objects.create(calendar=cal, date=date(self.year, 1, 3), is_working_day=True)

    def _list(self):
        request = APIRequestFactory().get('/api/plugins/payroll/work-calendar/')
        force_authenticate(request, user=self.admin)
        with CaptureQueriesContext(connection) as ctx:
            resp = PayrollWorkCalendarViewSet.as_view({'get': 'list'})(request)
            resp.render()
        self.assertEqual(resp.status_code, 200)
        rows = resp.data['results'] if isinstance(resp.data, dict) else resp.data
        return len(ctx.captured_queries), rows

    def test_working_day_count_is_flat_and_correct(self):
        self._calendar()
        one, _ = self._list()
        for _ in range(4):
            self._calendar()
        five, rows = self._list()
        self.assertEqual(len(rows), 5)
        for row in rows:
            self.assertEqual((row['workday_count'], row['working_day_count']), (3, 2))
        self.assertEqual(one, five)
