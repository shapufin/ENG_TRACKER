"""Integration tests for the Payroll plugin service and ViewSets."""
from datetime import date, time
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.overtime.models import OvertimeLog, Client as OvertimeClient
from apps.standby.models import StandbyLog
from plugins.payroll.models import (
    PayrollConfiguration,
    PayrollRun,
    PayrollRunEntry,
    PayrollRuleSet,
    WageAssignment,
)
from plugins.payroll.services.payroll_service import (
    build_calculation_input,
    finalize_run,
    generate_draft_run,
    get_period_closure_status,
    regenerate_single_line,
)
from plugins.payroll.services.calculator import calculate_payroll
from plugins.payroll.viewsets import (
    WageAssignmentViewSet,
    PayrollRunViewSet,
    PayrollRuleSetViewSet,
)

User = get_user_model()


class PayrollServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser(
            username='payroll_admin', email='admin@test.com', password='pass',
        )
        cls.employee = User.objects.create_user(
            username='emp1', email='emp1@test.com', password='pass',
            first_name='Test', last_name='Employee',
        )
        # Wage assignment
        WageAssignment.objects.create(
            user=cls.employee,
            gross_monthly_wage=Decimal('100000'),
            effective_from=date(2026, 1, 1),
            is_active=True,
        )
        # Seed reference rules
        from django.core.management import call_command
        call_command('seed_payroll_rules', verbosity=0)

    def setUp(self):
        self.factory = APIRequestFactory()

    def _run_with_source_entry(self, month=6):
        client = OvertimeClient.objects.create(
            name=f'Closure Client {month}', code=f'C{month}',
        )
        entry = OvertimeLog.objects.create(
            user=self.employee,
            client=client,
            date=date(2026, month, 15),
            hours=2,
            requested_processing_period=date(2026, month, 1),
            status='approved',
        )
        run = PayrollRun.objects.create(
            year=2026, month=month, status='draft',
            rule_set=PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE'),
            created_by=self.admin,
        )
        generate_draft_run(run, [self.employee])
        return run, entry

    def _close_user_for_period(self, user, month):
        from apps.users.models import ApprovalPeriodBoundary, ApprovalPeriodClose, ApprovalPeriodCloseMember
        from django.utils import timezone

        boundary = ApprovalPeriodBoundary.objects.create(period=date(2026, month, 1))
        close = ApprovalPeriodClose.objects.create(
            boundary=boundary, closed_at=timezone.now(), closed_by=self.admin,
            scope_key=f'test:{month}',
        )
        ApprovalPeriodCloseMember.objects.create(close=close, user=user)
        return close

    def test_period_closure_status_all_closed(self):
        run, entry = self._run_with_source_entry()
        close = self._close_user_for_period(self.employee, 6)
        entry.approval_period_close = close
        entry.save(update_fields=['approval_period_close'])

        readiness = get_period_closure_status(run)
        self.assertTrue(readiness['all_closed'])
        self.assertEqual(readiness['period'], date(2026, 6, 1))
        self.assertEqual(readiness['total_users'], 1)
        self.assertEqual(readiness['closed_users'], 1)
        self.assertEqual(readiness['unclosed_users'], [])
        self.assertEqual(readiness['entries_without_source_closure'], [])

    def test_period_closure_status_lists_unclosed_user_and_source(self):
        run, entry = self._run_with_source_entry(month=7)

        readiness = get_period_closure_status(run)
        self.assertFalse(readiness['all_closed'])
        self.assertEqual(readiness['unclosed_users'], [
            {'id': self.employee.id, 'username': self.employee.username},
        ])
        self.assertEqual(readiness['entries_without_source_closure'][0]['source_id'], entry.id)

    def test_period_closure_status_includes_base_wage_only_users(self):
        rule_set = PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE')
        run = PayrollRun.objects.create(
            year=2026, month=11, status='draft', rule_set=rule_set, created_by=self.admin,
        )
        generate_draft_run(run, [self.employee])

        readiness = get_period_closure_status(run)
        self.assertFalse(readiness['all_closed'])
        self.assertEqual(readiness['total_users'], 1)
        self.assertEqual(readiness['unclosed_users'][0]['id'], self.employee.id)
        self.assertEqual(readiness['entries_without_source_closure'], [])

    def test_period_closure_status_endpoint_includes_configuration(self):
        run, _ = self._run_with_source_entry(month=8)
        request = self.factory.get(f'/api/plugins/payroll/runs/{run.id}/period-closure-status/')
        force_authenticate(request, user=self.admin)
        response = PayrollRunViewSet.as_view({'get': 'period_closure_status'})(request, pk=run.id)

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['requires_tl_closed_before_finalize'])
        self.assertEqual(response.data['period'], '2026-08-01')

    def test_finalize_flag_blocks_unclosed_user(self):
        run, _ = self._run_with_source_entry(month=9)
        config = PayrollConfiguration.get_singleton()
        config.require_tl_closed_before_finalize = True
        config.save(update_fields=['require_tl_closed_before_finalize'])

        with self.assertRaisesRegex(ValidationError, self.employee.username):
            finalize_run(run, self.admin)
        run.refresh_from_db()
        self.assertEqual(run.status, 'draft')

    def test_finalize_flag_off_preserves_behavior_without_closure(self):
        run, _ = self._run_with_source_entry(month=10)
        config = PayrollConfiguration.get_singleton()
        config.require_tl_closed_before_finalize = False
        config.save(update_fields=['require_tl_closed_before_finalize'])

        finalize_run(run, self.admin)
        run.refresh_from_db()
        self.assertEqual(run.status, 'finalized')

    def test_may_entry_carried_to_june_uses_work_date_and_june_run(self):
        from apps.users.models import ApprovalPeriodBoundary, ApprovalPeriodClose, ApprovalPeriodCloseMember
        from django.utils import timezone

        boundary = ApprovalPeriodBoundary.objects.create(period=date(2026, 5, 1))
        close = ApprovalPeriodClose.objects.create(
            boundary=boundary,
            closed_at=timezone.now(),
            closed_by=self.admin,
            scope_key='managed-user:admin',
        )
        ApprovalPeriodCloseMember.objects.create(close=close, user=self.employee)
        client = OvertimeClient.objects.create(name='Carry Client', code='CARRY')
        entry = OvertimeLog.objects.create(
            user=self.employee,
            client=client,
            date=date(2026, 5, 30),
            hours=4,
            requested_processing_period=date(2026, 6, 1),
            approval_period_close=close,
            status='approved',
        )
        june = PayrollRun.objects.create(
            year=2026, month=6, status='draft',
            rule_set=PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE'),
            created_by=self.admin,
        )
        lines = generate_draft_run(june, [self.employee])
        self.assertEqual(lines[0].overtime_hours, Decimal('4'))
        self.assertTrue(lines[0].carryover_breakdown['carried_over'])
        inclusion = PayrollRunEntry.objects.get(source_id=entry.id)
        self.assertEqual(inclusion.requested_period, date(2026, 6, 1))
        self.assertEqual(inclusion.resolved_period, date(2026, 6, 1))
        finalize_run(june, self.admin)
        entry.refresh_from_db()
        self.assertEqual(entry.resolved_settlement_period, date(2026, 6, 1))

    def test_finalized_target_carryover_resolves_to_next_open_run(self):
        rule_set = PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE')
        june = PayrollRun.objects.create(
            year=2026, month=6, status='draft', rule_set=rule_set,
            created_by=self.admin,
        )
        generate_draft_run(june, [self.employee])
        finalize_run(june, self.admin)

        client = OvertimeClient.objects.create(name='Late Client', code='LATE')
        entry = OvertimeLog.objects.create(
            user=self.employee,
            client=client,
            date=date(2026, 5, 30),
            hours=2,
            requested_processing_period=date(2026, 6, 1),
            status='approved',
        )
        july = PayrollRun.objects.create(
            year=2026, month=7, status='draft', rule_set=rule_set,
            created_by=self.admin,
        )
        generate_draft_run(july, [self.employee])
        inclusion = PayrollRunEntry.objects.get(source_id=entry.id)
        self.assertEqual(inclusion.resolved_period, date(2026, 7, 1))
        self.assertEqual(inclusion.resolution_reason, 'target_finalized')
        self.assertEqual(july.lines.first().carryover_breakdown['carried_over'][0]['resolved_period'], '2026-07-01')

    def test_build_calculation_input_resolves_wage_and_rules(self):
        inp = build_calculation_input(self.employee, 2026, 1)
        self.assertEqual(inp.gross_monthly_wage, Decimal('100000'))
        self.assertEqual(inp.user_id, self.employee.id)
        self.assertEqual(len(inp.tax_brackets), 3)
        self.assertEqual(len(inp.contribution_rates), 4)
        self.assertEqual(len(inp.overtime_categories), 5)

    def test_generate_draft_run_creates_lines(self):
        rule_set = PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE')
        run = PayrollRun.objects.create(
            year=2026, month=1, status='draft', rule_set=rule_set,
            created_by=self.admin,
        )
        lines = generate_draft_run(run, [self.employee])
        self.assertEqual(len(lines), 1)
        line = lines[0]
        # Boshti reference: 100,000 gross → net 81,156
        self.assertEqual(line.net_pay, Decimal('79700'))
        self.assertEqual(line.employee_social, Decimal('9500'))
        self.assertEqual(line.employee_health, Decimal('1700'))
        self.assertEqual(line.income_tax, Decimal('9100'))
        # Totals populated
        self.assertIn('total_net', run.totals)
        self.assertEqual(run.totals['line_count'], 1)

    def test_finalize_run_makes_immutable(self):
        rule_set = PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE')
        run = PayrollRun.objects.create(
            year=2026, month=2, status='draft', rule_set=rule_set,
            created_by=self.admin,
        )
        generate_draft_run(run, [self.employee])
        finalize_run(run, self.admin)
        run.refresh_from_db()
        self.assertEqual(run.status, 'finalized')
        self.assertIsNotNone(run.finalized_at)
        self.assertEqual(run.finalized_by, self.admin)

    def test_finalized_line_and_entry_cannot_be_saved(self):
        run, _ = self._run_with_source_entry(month=12)
        finalize_run(run, self.admin)
        line = run.lines.get()
        entry = run.source_entries.get()

        line.total_gross += Decimal('1')
        with self.assertRaises(ValidationError):
            line.save()

        entry.hours += Decimal('1')
        with self.assertRaises(ValidationError):
            entry.save()

        run.refresh_from_db()
        self.assertEqual(run.status, 'finalized')
        self.assertEqual(run.source_entries.get().status, 'finalized')

    def test_finalize_run_rejects_empty(self):
        from django.core.exceptions import ValidationError
        rule_set = PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE')
        run = PayrollRun.objects.create(
            year=2026, month=3, status='draft', rule_set=rule_set,
            created_by=self.admin,
        )
        with self.assertRaises(ValidationError):
            finalize_run(run, self.admin)

    def test_regenerate_finalized_run_raises(self):
        from django.core.exceptions import ValidationError
        rule_set = PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE')
        run = PayrollRun.objects.create(
            year=2026, month=4, status='draft', rule_set=rule_set,
            created_by=self.admin,
        )
        generate_draft_run(run, [self.employee])
        run = finalize_run(run, self.admin)
        run.refresh_from_db()
        with self.assertRaises(ValidationError):
            generate_draft_run(run, [self.employee])

    def test_regenerate_cancelled_run_raises_without_deleting_lines(self):
        from django.core.exceptions import ValidationError
        rule_set = PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE')
        run = PayrollRun.objects.create(
            year=2026, month=5, status='draft', rule_set=rule_set,
            created_by=self.admin,
        )
        generate_draft_run(run, [self.employee])
        line_id = run.lines.get().id
        run.status = 'cancelled'
        run.save(update_fields=['status'])

        with self.assertRaises(ValidationError):
            generate_draft_run(run, [self.employee])

        self.assertEqual(list(run.lines.values_list('id', flat=True)), [line_id])

    def test_regenerate_line_for_cancelled_run_raises_without_deleting_line(self):
        from django.core.exceptions import ValidationError
        rule_set = PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE')
        run = PayrollRun.objects.create(
            year=2026, month=6, status='draft', rule_set=rule_set,
            created_by=self.admin,
        )
        generate_draft_run(run, [self.employee])
        line_id = run.lines.get().id
        run.status = 'cancelled'
        run.save(update_fields=['status'])

        with self.assertRaises(ValidationError):
            regenerate_single_line(run, self.employee)

        self.assertEqual(list(run.lines.values_list('id', flat=True)), [line_id])

    def test_overtime_included_in_calculation(self):
        # Create an overtime client
        ot_client = OvertimeClient.objects.create(name='Test Client', code='TC001')
        # OvertimeLog.save() auto-calculates hours from start/end times.
        # 08:00 to 18:00 = 10 hours.
        OvertimeLog.objects.create(
            user=self.employee, client=ot_client,
            date=date(2026, 1, 7),  # Wednesday
            hours=Decimal('10'),
            start_time=time(8, 0), end_time=time(18, 0),
            status='approved',
        )
        inp = build_calculation_input(self.employee, 2026, 1)
        result = calculate_payroll(inp)
        self.assertEqual(result.overtime_hours, Decimal('10'))
        self.assertGreater(result.overtime_amount, Decimal('0'))
        self.assertGreater(result.total_gross, Decimal('100000'))

    def test_standby_included_in_calculation(self):
        StandbyLog.objects.create(
            user=self.employee,
            date=date(2026, 1, 7),
            hours=Decimal('20'),
            status='approved',
        )
        # Set standby rate (Jan 7 is a Wednesday → weekday rate)
        config = PayrollConfiguration.get_singleton()
        config.weekday_standby_hourly_rate = Decimal('100')
        config.save()
        inp = build_calculation_input(self.employee, 2026, 1)
        result = calculate_payroll(inp)
        self.assertEqual(result.standby_hours, Decimal('20'))
        self.assertEqual(result.standby_amount, Decimal('2000'))


class PayrollViewSetTests(TestCase):
    """ViewSet tests using APIRequestFactory (avoids Python 3.14 test-client issue)."""
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser(
            username='api_admin', email='apiadmin@test.com', password='pass',
        )
        cls.employee = User.objects.create_user(
            username='api_emp', email='apiemp@test.com', password='pass',
        )
        WageAssignment.objects.create(
            user=cls.employee,
            gross_monthly_wage=Decimal('100000'),
            effective_from=date(2026, 1, 1),
            effective_to=date(2026, 12, 31),
            is_active=True,
        )
        from django.core.management import call_command
        call_command('seed_payroll_rules', verbosity=0)

    def setUp(self):
        self.factory = APIRequestFactory()

    def _wages_list_request(self, user):
        request = self.factory.get('/api/plugins/payroll/wages/')
        force_authenticate(request, user=user)
        view = WageAssignmentViewSet.as_view({'get': 'list'})
        return view(request)

    def test_list_wages(self):
        resp = self._wages_list_request(self.admin)
        self.assertEqual(resp.status_code, 200)

    def test_create_wage(self):
        request = self.factory.post('/api/plugins/payroll/wages/', {
            'user': self.employee.id,
            'gross_monthly_wage': '120000',
            'effective_from': '2027-01-01',
            'is_active': True,
        }, format='json')
        force_authenticate(request, user=self.admin)
        view = WageAssignmentViewSet.as_view({'post': 'create'})
        resp = view(request)
        self.assertEqual(resp.status_code, 201)

    def test_list_rule_sets(self):
        request = self.factory.get('/api/plugins/payroll/rule-sets/')
        force_authenticate(request, user=self.admin)
        view = PayrollRuleSetViewSet.as_view({'get': 'list'})
        resp = view(request)
        self.assertEqual(resp.status_code, 200)

    def test_create_run(self):
        request = self.factory.post('/api/plugins/payroll/runs/', {
            'year': 2026, 'month': 1,
            'user_ids': [self.employee.id],
        }, format='json')
        force_authenticate(request, user=self.admin)
        view = PayrollRunViewSet.as_view({'post': 'create'})
        resp = view(request)
        self.assertEqual(resp.status_code, 201)
        resp.render()
        self.assertEqual(resp.data['status'], 'draft')
        self.assertEqual(resp.data['line_count'], 1)

    def test_create_run_rolls_back_when_selected_user_has_no_wage(self):
        employee_without_wage = User.objects.create_user(username='no_wage', password='pass')
        request = self.factory.post('/api/plugins/payroll/runs/', {
            'year': 2026, 'month': 2,
            'user_ids': [employee_without_wage.id],
        }, format='json')
        force_authenticate(request, user=self.admin)
        response = PayrollRunViewSet.as_view({'post': 'create'})(request)

        self.assertEqual(response.status_code, 400)
        self.assertFalse(PayrollRun.objects.filter(year=2026, month=2).exists())

    def test_finalize_run(self):
        # Create run via service
        rule_set = PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE')
        run = PayrollRun.objects.create(
            year=2026, month=5, status='draft', rule_set=rule_set,
            created_by=self.admin,
        )
        generate_draft_run(run, [self.employee])
        # Finalize via ViewSet
        request = self.factory.post(f'/api/plugins/payroll/runs/{run.id}/finalize/')
        force_authenticate(request, user=self.admin)
        view = PayrollRunViewSet.as_view({'post': 'finalize'})
        resp = view(request, pk=run.id)
        self.assertEqual(resp.status_code, 200)
        resp.render()
        self.assertEqual(resp.data['status'], 'finalized')

    def test_preview_calculation(self):
        request = self.factory.post('/api/plugins/payroll/runs/preview/', {
            'user_id': self.employee.id,
            'year': 2026, 'month': 1,
        }, format='json')
        force_authenticate(request, user=self.admin)
        view = PayrollRunViewSet.as_view({'post': 'preview'})
        resp = view(request)
        self.assertEqual(resp.status_code, 200)
        resp.render()
        self.assertEqual(resp.data['gross_monthly_wage'], '100000')
        self.assertEqual(resp.data['net_pay'], '79700')

    def test_non_admin_denied(self):
        non_admin = User.objects.create_user(
            username='regular', email='regular@test.com', password='pass',
        )
        resp = self._wages_list_request(non_admin)
        # Non-admin (no plugin permission) should be denied
        self.assertEqual(resp.status_code, 403)

    def test_export_excel(self):
        # Create run via service
        rule_set = PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE')
        run = PayrollRun.objects.create(
            year=2026, month=7, status='draft', rule_set=rule_set,
            created_by=self.admin,
        )
        generate_draft_run(run, [self.employee])
        finalize_run(run, self.admin)
        # Export via ViewSet
        request = self.factory.get(f'/api/plugins/payroll/runs/{run.id}/export_excel/')
        force_authenticate(request, user=self.admin)
        view = PayrollRunViewSet.as_view({'get': 'export_excel'})
        resp = view(request, pk=run.id)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp['Content-Type'],
                         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
