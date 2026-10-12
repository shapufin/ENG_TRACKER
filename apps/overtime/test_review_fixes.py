from datetime import date
from decimal import Decimal
from uuid import uuid4

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.overtime.models import Client, OvertimeLog
from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role
from apps.users.models import Team, TeamMembership
from apps.users.services.approval_periods import finalize_period, next_period
from plugins.payroll.models import PayrollConfiguration, PayrollRun, PayrollRuleSet, WageAssignment
from plugins.payroll.services.payroll_service import (
    finalize_run, generate_draft_run, get_period_closure_status,
)


class ReviewFixesTests(TestCase):
    def setUp(self):
        PayrollConfiguration.objects.update_or_create(pk=1, defaults={'require_tl_closed_before_finalize': False})
        self.api = APIClient()
        today = timezone.now().date()
        self.month = today.replace(day=1)
        self.next_month = next_period(self.month)
        self.client_obj = Client.objects.create(name=f'C{uuid4().hex[:8]}', code=f'C{uuid4().hex[:8]}')
        Role.objects.get_or_create(code='italian_tl', defaults={'name': 'Italian TL'})
        self.admin = User.objects.create_superuser(username=f'adm{uuid4().hex[:6]}', password='x', email='a@a.a')
        self.emp = User.objects.create_user(username=f'emp{uuid4().hex[:6]}', password='x')
        self.tl = User.objects.create_user(username=f'tl{uuid4().hex[:6]}', password='x')
        assign_role(self.tl, 'italian_tl')
        team = Team.objects.create(name=f'T{uuid4().hex[:6]}', code=f'T{uuid4().hex[:6]}')
        TeamMembership.objects.create(user_profile=self.tl.profile, team=team, is_primary_team=True)
        TeamMembership.objects.create(user_profile=self.emp.profile, team=team)

    def _entry(self, day, **kwargs):
        defaults = dict(user=self.emp, client=self.client_obj, date=day, hours=Decimal('2'), status='approved')
        defaults.update(kwargs)
        return OvertimeLog.objects.create(**defaults)

    def _stale_run(self):
        call_command('seed_payroll_rules')
        WageAssignment.objects.create(user=self.emp, gross_monthly_wage=Decimal('100000'),
                                      effective_from=date(2020, 1, 1))
        entry = self._entry(self.month)
        run = PayrollRun.objects.create(year=self.month.year, month=self.month.month, status='draft',
                                        rule_set=PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE'),
                                        created_by=self.admin)
        generate_draft_run(run, [self.emp])
        OvertimeLog.objects.filter(pk=entry.pk).update(hours=Decimal('8'))
        return run

    # 1. Payroll must not finalize with hours that changed after generation.
    def test_finalize_rejects_entry_changed_after_generation(self):
        with self.assertRaises(DjangoValidationError):
            finalize_run(self._stale_run(), self.admin)

    # 1b. The finalize endpoint must return the real reason, not a generic failure.
    def test_finalize_endpoint_reports_stale_entry_reason(self):
        from rest_framework.test import APIRequestFactory, force_authenticate
        from plugins.payroll.viewsets import PayrollRunViewSet
        run = self._stale_run()
        request = APIRequestFactory().post(f'/api/plugins/payroll/runs/{run.id}/finalize/', {}, format='json')
        force_authenticate(request, user=self.admin)
        response = PayrollRunViewSet.as_view({'post': 'finalize'})(request, pk=run.id)
        self.assertEqual(response.status_code, 400)
        self.assertIn('changed after this draft', str(response.data['detail']))

    # 3. Readiness must accept an entry closed under its own work-date period.
    def test_closure_readiness_accepts_carried_over_entry(self):
        call_command('seed_payroll_rules')
        WageAssignment.objects.create(user=self.emp, gross_monthly_wage=Decimal('100000'),
                                      effective_from=date(2020, 1, 1))
        finalize_period(self.tl, self.month)
        entry = self._entry(self.month, status='approved')
        self.assertEqual(entry.requested_processing_period, self.next_month)
        run = PayrollRun.objects.create(year=self.next_month.year, month=self.next_month.month, status='draft',
                                        rule_set=PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE'),
                                        created_by=self.admin)
        generate_draft_run(run, [self.emp])
        readiness = get_period_closure_status(run)
        self.assertNotIn(entry.id, [e['source_id'] for e in readiness['entries_without_source_closure']])

    # 4. Moving an entry's work date re-derives its processing period.
    def test_date_change_recomputes_processing_period(self):
        entry = self._entry(self.month, status='pending')
        self.assertEqual(entry.requested_processing_period, self.month)
        finalize_period(self.tl, self.month)
        self.api.force_authenticate(self.admin)
        response = self.api.patch(f'/api/overtime/logs/{entry.id}/',
                                  {'date': self.month.replace(day=2).isoformat()}, format='json')
        self.assertEqual(response.status_code, 200)
        entry.refresh_from_db()
        self.assertEqual(entry.requested_processing_period, self.next_month)

    # 5. Finalizing a month for an empty scope must not create a close.
    def test_finalize_rejects_empty_managed_scope(self):
        lonely = User.objects.create_superuser(username=f'lone{uuid4().hex[:6]}', password='x', email='l@l.l')
        with self.assertRaises(ValidationError):
            finalize_period(lonely, self.month)
