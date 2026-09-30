"""IDOR regression: a scoped (non-manage-grant) payroll viewer must never
see another team's salary lines just because they can reach the run.

Part of the security/perf/cache audit (see
``.devin/plans/plan-security-perf-cache-audit-2026-09-27.md``, Phase 3).

``PayrollRunViewSet.get_queryset()`` scopes *which runs* a plain team leader
(payroll 'view'/'export' grant, no 'manage' grant) can reach via
``_allowed_payroll_user_ids`` — but a payroll run is company-wide (one run
per period, many teams' lines in it), and ``lines()``/``payslip()`` used to
return/serve every line in the run once the TL could reach it at all, not
just the lines belonging to their own team. ``export_excel``/``export_pdf``
build one consolidated file for every line in the run and can't be filtered
down, so those two now require unrestricted (staff/manage-grant) access
instead of silently handing back the whole company's payroll.
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from plugins.payroll.models import PayrollRun, PayrollRuleSet, WageAssignment
from plugins.payroll.services.payroll_service import finalize_run, generate_draft_run
from plugins.payroll.viewsets import PayrollRunViewSet

User = get_user_model()


class PayrollRunLineScopeLeakTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from apps.permissions.models import Role
        from apps.permissions.services.role_service import assign_role
        from apps.plugins.models import PluginPermission

        cls.admin = User.objects.create_superuser(
            username='scope_admin', email='scope_admin@test.com', password='pass',
        )

        # A plain team leader: payroll 'view'+'export' grant (so they can
        # reach these endpoints at all), but NOT 'manage' — the grant that
        # makes `_allowed_payroll_user_ids` return None (unrestricted).
        tl_role, _ = Role.objects.get_or_create(code='team_leader', defaults={'name': 'Team Leader'})
        for action in ('view', 'export'):
            perm, _ = PluginPermission.objects.get_or_create(plugin_name='payroll', action=action)
            perm.allowed_roles.add(tl_role)

        cls.tl_user = User.objects.create_user(username='tl_scope', password='pass')
        assign_role(cls.tl_user, 'team_leader')

        cls.subordinate = User.objects.create_user(username='tl_subordinate', password='pass')
        cls.subordinate.profile.italian_tl = cls.tl_user
        cls.subordinate.profile.save(update_fields=['italian_tl'])

        cls.unrelated = User.objects.create_user(username='unrelated_employee', password='pass')

        for user in (cls.subordinate, cls.unrelated):
            WageAssignment.objects.create(
                user=user,
                gross_monthly_wage=Decimal('100000'),
                effective_from=date(2026, 1, 1),
                is_active=True,
            )

        from django.core.management import call_command
        call_command('seed_payroll_rules', verbosity=0)

        rule_set = PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE')
        cls.payroll_run = PayrollRun.objects.create(
            year=2026, month=6, status='draft', rule_set=rule_set,
            created_by=cls.admin,
        )
        generate_draft_run(cls.payroll_run, [cls.subordinate, cls.unrelated])
        finalize_run(cls.payroll_run, cls.admin)

        cls.subordinate_line_id = cls.payroll_run.lines.get(user=cls.subordinate).id
        cls.unrelated_line_id = cls.payroll_run.lines.get(user=cls.unrelated).id

    def setUp(self):
        self.factory = APIRequestFactory()

    def test_scoped_tl_lines_excludes_other_teams_salaries(self):
        request = self.factory.get(f'/api/plugins/payroll/runs/{self.payroll_run.id}/lines/')
        force_authenticate(request, user=self.tl_user)
        resp = PayrollRunViewSet.as_view({'get': 'lines'})(request, pk=self.payroll_run.id)
        resp.render()

        self.assertEqual(resp.status_code, 200)
        returned_user_ids = {line['user'] for line in resp.data}
        self.assertIn(self.subordinate.id, returned_user_ids)
        self.assertNotIn(self.unrelated.id, returned_user_ids)

    def test_scoped_tl_cannot_download_another_teams_payslip(self):
        request = self.factory.get(
            f'/api/plugins/payroll/runs/{self.payroll_run.id}/payslip/',
            {'line_id': self.unrelated_line_id},
        )
        force_authenticate(request, user=self.tl_user)
        resp = PayrollRunViewSet.as_view({'get': 'payslip'})(request, pk=self.payroll_run.id)

        self.assertEqual(resp.status_code, 404)

    def test_scoped_tl_can_still_download_own_subordinates_payslip(self):
        request = self.factory.get(
            f'/api/plugins/payroll/runs/{self.payroll_run.id}/payslip/',
            {'line_id': self.subordinate_line_id},
        )
        force_authenticate(request, user=self.tl_user)
        resp = PayrollRunViewSet.as_view({'get': 'payslip'})(request, pk=self.payroll_run.id)

        self.assertEqual(resp.status_code, 200)

    def test_scoped_tl_cannot_export_whole_run_excel(self):
        request = self.factory.get(f'/api/plugins/payroll/runs/{self.payroll_run.id}/export_excel/')
        force_authenticate(request, user=self.tl_user)
        resp = PayrollRunViewSet.as_view({'get': 'export_excel'})(request, pk=self.payroll_run.id)

        self.assertEqual(resp.status_code, 403)

    def test_scoped_tl_cannot_export_whole_run_pdf(self):
        request = self.factory.get(f'/api/plugins/payroll/runs/{self.payroll_run.id}/export_pdf/')
        force_authenticate(request, user=self.tl_user)
        resp = PayrollRunViewSet.as_view({'get': 'export_pdf'})(request, pk=self.payroll_run.id)

        self.assertEqual(resp.status_code, 403)

    def test_admin_export_still_works(self):
        request = self.factory.get(f'/api/plugins/payroll/runs/{self.payroll_run.id}/export_excel/')
        force_authenticate(request, user=self.admin)
        resp = PayrollRunViewSet.as_view({'get': 'export_excel'})(request, pk=self.payroll_run.id)

        self.assertEqual(resp.status_code, 200)

    # -- run-level aggregates: the run row itself is company-wide too --------

    def _run_detail(self, user):
        request = self.factory.get(f'/api/plugins/payroll/runs/{self.payroll_run.id}/')
        force_authenticate(request, user=user)
        resp = PayrollRunViewSet.as_view({'get': 'retrieve'})(request, pk=self.payroll_run.id)
        resp.render()
        return resp

    def test_scoped_tl_run_detail_reports_only_their_own_lines(self):
        resp = self._run_detail(self.tl_user)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['line_count'], 1)
        own_line = self.payroll_run.lines.get(user=self.subordinate)
        self.assertEqual(resp.data['totals']['line_count'], 1)
        self.assertEqual(Decimal(resp.data['totals']['total_gross']), own_line.total_gross)
        self.assertEqual(Decimal(resp.data['totals']['total_net']), own_line.net_pay)

    def test_scoped_tl_run_list_does_not_leak_company_totals(self):
        request = self.factory.get('/api/plugins/payroll/runs/')
        force_authenticate(request, user=self.tl_user)
        resp = PayrollRunViewSet.as_view({'get': 'list'})(request)
        resp.render()
        rows = resp.data['results'] if isinstance(resp.data, dict) else resp.data
        self.assertEqual([row['line_count'] for row in rows], [1])

    def test_admin_run_detail_still_reports_company_totals(self):
        resp = self._run_detail(self.admin)
        self.assertEqual(resp.data['line_count'], 2)
        self.assertEqual(resp.data['totals']['line_count'], 2)

    def test_scoped_tl_cannot_read_period_closure_status(self):
        request = self.factory.get(
            f'/api/plugins/payroll/runs/{self.payroll_run.id}/period-closure-status/'
        )
        force_authenticate(request, user=self.tl_user)
        resp = PayrollRunViewSet.as_view({'get': 'period_closure_status'})(
            request, pk=self.payroll_run.id
        )
        self.assertEqual(resp.status_code, 403)

    def test_admin_period_closure_status_still_works(self):
        request = self.factory.get(
            f'/api/plugins/payroll/runs/{self.payroll_run.id}/period-closure-status/'
        )
        force_authenticate(request, user=self.admin)
        resp = PayrollRunViewSet.as_view({'get': 'period_closure_status'})(
            request, pk=self.payroll_run.id
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['total_users'], 2)
