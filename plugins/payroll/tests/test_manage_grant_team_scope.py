"""The payroll ``manage`` grant does not, by itself, unlock company-wide payroll.

Decision (2026-10-11): unrestricted payroll scope is for staff, superusers and
HR only. Everyone else - a team leader, a payroll manager, anyone holding the
``manage`` grant without HR/staff - is scoped to themselves plus their own
team (``profile.get_team_member_ids()``). Whole-run actions (create, update,
destroy, finalize, cancel, consolidated exports, closure status) act on every
team's lines at once, so a scoped user is refused them (fail closed).
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from plugins.payroll.models import PayrollLine, PayrollRun, PayrollRuleSet, WageAssignment
from plugins.payroll.services.payroll_service import finalize_run, generate_draft_run
from plugins.payroll.viewsets import PayrollRunViewSet, WageAssignmentViewSet

User = get_user_model()

RUNS = '/api/plugins/payroll/runs/'


class ManageGrantTeamScopeTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from apps.permissions.models import Role
        from apps.permissions.services.role_service import assign_role
        from apps.plugins.models import PluginPermission

        role_names = {
            'team_leader': 'Team Leader',
            'hr': 'HR',
            'payroll_manager': 'Payroll manager',
            'employee': 'Employee',
        }
        for code, name in role_names.items():
            Role.objects.get_or_create(code=code, defaults={'name': name})

        # 'manage' and 'export' are granted to TL, HR and the payroll manager;
        # 'view' to everyone who must reach the payroll endpoints at all.
        grants = {
            'view': ['team_leader', 'hr', 'payroll_manager', 'employee'],
            'manage': ['team_leader', 'hr', 'payroll_manager'],
            'export': ['team_leader', 'hr', 'payroll_manager'],
        }
        for action, codes in grants.items():
            perm, _ = PluginPermission.objects.get_or_create(plugin_name='payroll', action=action)
            for code in codes:
                perm.allowed_roles.add(Role.objects.get(code=code))

        cls.admin = User.objects.create_superuser(
            username='ms_admin', email='ms_admin@test.com', password='pass',
        )

        # Team A: a team leader with the manage grant and one team member.
        cls.tl = User.objects.create_user(username='ms_tl', password='pass')
        assign_role(cls.tl, 'team_leader')
        cls.subordinate = User.objects.create_user(username='ms_subordinate', password='pass')
        cls.subordinate.profile.italian_tl = cls.tl
        cls.subordinate.profile.save(update_fields=['italian_tl'])

        # Team B: another leader and member - the "other team" the TL must not reach.
        cls.other_tl = User.objects.create_user(username='ms_other_tl', password='pass')
        assign_role(cls.other_tl, 'team_leader')
        cls.other_member = User.objects.create_user(username='ms_other_member', password='pass')
        cls.other_member.profile.italian_tl = cls.other_tl
        cls.other_member.profile.save(update_fields=['italian_tl'])

        # HR: holds the same grants but is unrestricted by is_hr.
        cls.hr = User.objects.create_user(username='ms_hr', password='pass')
        cls.hr.profile.is_hr_user = True
        cls.hr.profile.save()
        assign_role(cls.hr, 'hr')

        # Payroll manager: manage grant only, no team, not HR.
        cls.manager = User.objects.create_user(username='ms_manager', password='pass')
        assign_role(cls.manager, 'payroll_manager')

        # Plain employee: view grant only, no team.
        cls.employee = User.objects.create_user(username='ms_employee', password='pass')
        assign_role(cls.employee, 'employee')

        # No payroll grant at all.
        cls.nogrant = User.objects.create_user(username='ms_nogrant', password='pass')

        for user in (cls.subordinate, cls.other_member):
            WageAssignment.objects.create(
                user=user,
                gross_monthly_wage=Decimal('100000'),
                effective_from=date(2026, 1, 1),
                is_active=True,
            )

        call_command('seed_payroll_rules', verbosity=0)
        rule_set = PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE')

        cls.finalized = PayrollRun.objects.create(
            year=2026, month=4, status='draft', rule_set=rule_set, created_by=cls.admin,
        )
        generate_draft_run(cls.finalized, [cls.subordinate, cls.other_member])
        finalize_run(cls.finalized, cls.admin)

        cls.draft = PayrollRun.objects.create(
            year=2026, month=5, status='draft', rule_set=rule_set, created_by=cls.admin,
        )
        generate_draft_run(cls.draft, [cls.subordinate, cls.other_member])

        cls.finalized_other_line_id = cls.finalized.lines.get(user=cls.other_member).id
        cls.finalized_own_line_id = cls.finalized.lines.get(user=cls.subordinate).id

    def setUp(self):
        self.factory = APIRequestFactory()

    def _call(self, view_cls, user, method, action, path, pk=None, body=None):
        if method == 'get':
            request = self.factory.get(path)
        else:
            request = getattr(self.factory, method)(path, body or {}, format='json')
        force_authenticate(request, user=user)
        view = view_cls.as_view({method: action})
        if pk is not None:
            return view(request, pk=pk)
        return view(request)

    def _run_call(self, user, method, action, path, run, body=None):
        return self._call(PayrollRunViewSet, user, method, action, path, pk=run.id, body=body)

    # -- read scope: a team leader holding the manage grant -----------------

    def test_tl_with_manage_grant_lists_only_own_team_lines(self):
        response = self._run_call(
            self.tl, 'get', 'lines', f'{RUNS}{self.finalized.id}/lines/', self.finalized,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual({row['user'] for row in response.data}, {self.subordinate.id})

    def test_tl_with_manage_grant_run_detail_reports_only_team_totals(self):
        response = self._run_call(
            self.tl, 'get', 'retrieve', f'{RUNS}{self.finalized.id}/', self.finalized,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['line_count'], 1)

    def test_tl_with_manage_grant_cannot_download_other_teams_payslip(self):
        response = self._run_call(
            self.tl, 'get', 'payslip',
            f'{RUNS}{self.finalized.id}/payslip/?line_id={self.finalized_other_line_id}',
            self.finalized,
        )
        self.assertEqual(response.status_code, 404)

    def test_tl_with_manage_grant_can_download_own_team_payslip(self):
        response = self._run_call(
            self.tl, 'get', 'payslip',
            f'{RUNS}{self.finalized.id}/payslip/?line_id={self.finalized_own_line_id}',
            self.finalized,
        )
        self.assertEqual(response.status_code, 200)

    def test_tl_with_manage_grant_wage_list_is_team_scoped(self):
        response = self._call(WageAssignmentViewSet, self.tl, 'get', 'list', '/api/plugins/payroll/wages/')
        self.assertEqual(response.status_code, 200)
        rows = response.data['results'] if isinstance(response.data, dict) else response.data
        self.assertEqual({row['user'] for row in rows}, {self.subordinate.id})

    def test_tl_with_manage_grant_cannot_read_period_closure_status(self):
        response = self._run_call(
            self.tl, 'get', 'period_closure_status',
            f'{RUNS}{self.finalized.id}/period-closure-status/', self.finalized,
        )
        self.assertEqual(response.status_code, 403)

    # -- write scope: generate / regenerate only the team's lines ----------

    def test_tl_cannot_regenerate_line_for_non_team_user(self):
        other_line_id = self.draft.lines.get(user=self.other_member).id
        response = self._run_call(
            self.tl, 'post', 'generate_line', f'{RUNS}{self.draft.id}/generate_line/', self.draft,
            body={'user_id': self.other_member.id},
        )
        self.assertEqual(response.status_code, 403)
        self.assertTrue(PayrollLine.objects.filter(pk=other_line_id).exists())

    def test_tl_run_regenerate_keeps_other_teams_line_untouched(self):
        other_line_id = self.draft.lines.get(user=self.other_member).id
        response = self._run_call(
            self.tl, 'post', 'generate', f'{RUNS}{self.draft.id}/generate/', self.draft, body={},
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(PayrollLine.objects.filter(pk=other_line_id).exists())
        self.assertEqual(self.draft.lines.count(), 2)

    def test_tl_cannot_finalize_a_run_holding_other_teams_lines(self):
        response = self._run_call(
            self.tl, 'post', 'finalize', f'{RUNS}{self.draft.id}/finalize/', self.draft,
        )
        self.assertEqual(response.status_code, 403)
        self.draft.refresh_from_db()
        self.assertEqual(self.draft.status, 'draft')

    def test_tl_cannot_cancel_a_run_holding_other_teams_lines(self):
        response = self._run_call(
            self.tl, 'post', 'cancel', f'{RUNS}{self.draft.id}/cancel/', self.draft,
        )
        self.assertEqual(response.status_code, 403)
        self.draft.refresh_from_db()
        self.assertEqual(self.draft.status, 'draft')

    def test_tl_cannot_delete_a_draft_run_holding_other_teams_lines(self):
        response = self._run_call(
            self.tl, 'delete', 'destroy', f'{RUNS}{self.draft.id}/', self.draft,
        )
        self.assertEqual(response.status_code, 403)
        self.assertTrue(PayrollRun.objects.filter(pk=self.draft.pk).exists())

    def test_tl_cannot_edit_a_draft_run(self):
        response = self._run_call(
            self.tl, 'patch', 'partial_update', f'{RUNS}{self.draft.id}/', self.draft,
            body={'notes': 'changed by team leader'},
        )
        self.assertEqual(response.status_code, 403)
        self.draft.refresh_from_db()
        self.assertEqual(self.draft.notes, '')

    def test_tl_cannot_create_a_company_run(self):
        response = self._call(
            PayrollRunViewSet, self.tl, 'post', 'create', RUNS,
            body={'year': 2026, 'month': 7},
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(PayrollRun.objects.filter(year=2026, month=7).exists())

    # -- whole-run exports are refused (fail closed) ------------------------

    def test_tl_with_manage_grant_cannot_export_whole_run_excel(self):
        response = self._run_call(
            self.tl, 'get', 'export_excel', f'{RUNS}{self.finalized.id}/export_excel/', self.finalized,
        )
        self.assertEqual(response.status_code, 403)

    def test_tl_with_manage_grant_cannot_export_whole_run_pdf(self):
        response = self._run_call(
            self.tl, 'get', 'export_pdf', f'{RUNS}{self.finalized.id}/export_pdf/', self.finalized,
        )
        self.assertEqual(response.status_code, 403)

    # -- the manage grant alone is not an unrestricted scope ----------------

    def test_manage_grant_without_hr_or_team_sees_no_runs_of_other_teams(self):
        # The manager has no line in either run, so neither run is reachable.
        list_response = self._call(PayrollRunViewSet, self.manager, 'get', 'list', RUNS)
        self.assertEqual(list_response.status_code, 200)
        rows = list_response.data['results'] if isinstance(list_response.data, dict) else list_response.data
        self.assertEqual(rows, [])
        lines_response = self._run_call(
            self.manager, 'get', 'lines', f'{RUNS}{self.finalized.id}/lines/', self.finalized,
        )
        self.assertEqual(lines_response.status_code, 404)

    def test_manage_grant_without_hr_or_team_cannot_finalize(self):
        response = self._run_call(
            self.manager, 'post', 'finalize', f'{RUNS}{self.draft.id}/finalize/', self.draft,
        )
        self.assertEqual(response.status_code, 404)
        self.draft.refresh_from_db()
        self.assertEqual(self.draft.status, 'draft')

    # -- HR, staff and superusers keep the whole company ---------------------

    def test_hr_with_manage_grant_sees_all_lines(self):
        response = self._run_call(
            self.hr, 'get', 'lines', f'{RUNS}{self.finalized.id}/lines/', self.finalized,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            {row['user'] for row in response.data}, {self.subordinate.id, self.other_member.id},
        )

    def test_hr_can_download_another_teams_payslip(self):
        response = self._run_call(
            self.hr, 'get', 'payslip',
            f'{RUNS}{self.finalized.id}/payslip/?line_id={self.finalized_other_line_id}',
            self.finalized,
        )
        self.assertEqual(response.status_code, 200)

    def test_hr_can_export_whole_run_excel(self):
        response = self._run_call(
            self.hr, 'get', 'export_excel', f'{RUNS}{self.finalized.id}/export_excel/', self.finalized,
        )
        self.assertEqual(response.status_code, 200)

    def test_admin_sees_all_lines_and_totals(self):
        lines = self._run_call(
            self.admin, 'get', 'lines', f'{RUNS}{self.finalized.id}/lines/', self.finalized,
        )
        self.assertEqual(len(lines.data), 2)
        detail = self._run_call(
            self.admin, 'get', 'retrieve', f'{RUNS}{self.finalized.id}/', self.finalized,
        )
        self.assertEqual(detail.data['line_count'], 2)

    # -- plain users see nothing outside themselves --------------------------

    def test_employee_without_team_cannot_reach_a_run_with_no_line_of_their_own(self):
        # get_queryset() hides any run that contains none of the user's lines.
        response = self._run_call(
            self.employee, 'get', 'lines', f'{RUNS}{self.finalized.id}/lines/', self.finalized,
        )
        self.assertEqual(response.status_code, 404)

    def test_employee_without_team_sees_no_wages_of_others(self):
        response = self._call(WageAssignmentViewSet, self.employee, 'get', 'list', '/api/plugins/payroll/wages/')
        rows = response.data['results'] if isinstance(response.data, dict) else response.data
        self.assertEqual(rows, [])

    def test_user_without_payroll_grant_is_refused(self):
        response = self._run_call(
            self.nogrant, 'get', 'lines', f'{RUNS}{self.finalized.id}/lines/', self.finalized,
        )
        self.assertEqual(response.status_code, 403)

    def test_tl_with_manage_grant_cannot_preview_another_teams_payroll(self):
        response = self._call(
            PayrollRunViewSet, self.tl, 'post', 'preview', f'{RUNS}preview/',
            body={'user_id': self.other_member.id, 'year': 2026, 'month': 4},
        )
        self.assertEqual(response.status_code, 403)

    def test_tl_with_manage_grant_cannot_read_another_teams_wage_history(self):
        response = self._call(
            WageAssignmentViewSet, self.tl, 'get', 'history',
            f'/api/plugins/payroll/wages/history/?user_id={self.other_member.id}',
        )
        self.assertEqual(response.status_code, 403)
