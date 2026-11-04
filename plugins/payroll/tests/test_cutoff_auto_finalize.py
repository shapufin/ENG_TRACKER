"""Month cutoff: a TL must close the month, until the system does it at date 2."""
from datetime import date, datetime
from decimal import Decimal
from unittest import mock
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import TestCase
from django.utils.module_loading import import_string

from apps.users.models import ApprovalPeriodCloseMember
from apps.users.services.approval_periods import finalize_period
from plugins.payroll.models import PayrollConfiguration, PayrollRuleSet, PayrollRun, WageAssignment
from plugins.payroll.plugin import PayrollPlugin
from plugins.payroll.services.payroll_service import (
    auto_finalize_previous_month,
    finalize_run,
    generate_draft_run,
    get_period_closure_status,
)

User = get_user_model()
TIRANE = ZoneInfo('Europe/Tirane')
BEFORE_CUTOFF = datetime(2026, 10, 1, 23, 59, tzinfo=TIRANE)
AT_CUTOFF = datetime(2026, 10, 2, 0, 0, tzinfo=TIRANE)


def at(moment):
    return mock.patch('django.utils.timezone.now', return_value=moment)


class CutoffAutoFinalizeTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        PayrollConfiguration.objects.update_or_create(
            pk=1, defaults={'require_tl_closed_before_finalize': True},
        )
        call_command('seed_payroll_rules', verbosity=0)
        cls.admin = User.objects.create_superuser('hr_admin', password='x')
        cls.line_manager = User.objects.create_user('artur', password='x')
        cls.manager = User.objects.create_user('marco', password='x')
        cls.staffer = User.objects.create_user('staffer', password='x', first_name='Sta', last_name='Ffer')
        cls.bystander = User.objects.create_user('bystander', password='x')
        profile = cls.staffer.profile
        profile.albanian_tl, profile.italian_tl = cls.line_manager, cls.manager
        profile.save(update_fields=['albanian_tl', 'italian_tl'])
        WageAssignment.objects.create(
            user=cls.staffer, gross_monthly_wage=Decimal('100000'),
            effective_from=date(2026, 1, 1), is_active=True,
        )

    def _september_run(self):
        run = PayrollRun.objects.create(
            year=2026, month=9, status='draft', created_by=self.admin,
            rule_set=PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE'),
        )
        generate_draft_run(run, [self.staffer])
        return run

    def test_status_names_the_managers_to_chase_and_the_cutoff(self):
        run = self._september_run()
        with at(BEFORE_CUTOFF):
            status = get_period_closure_status(run)

        self.assertFalse(status['cutoff_passed'])
        self.assertEqual(status['cutoff_date'], '2026-10-02T00:00:00+02:00')
        self.assertEqual(status['unclosed_users'], [{
            'id': self.staffer.id, 'username': 'staffer', 'full_name': 'Sta Ffer',
            'line_manager': 'artur', 'manager': 'marco',
        }])

    def test_status_reports_the_cutoff_as_passed(self):
        run = self._september_run()
        with at(AT_CUTOFF):
            self.assertTrue(get_period_closure_status(run)['cutoff_passed'])

    def test_finalize_before_cutoff_is_refused_and_names_the_managers(self):
        run = self._september_run()
        with at(BEFORE_CUTOFF), self.assertRaisesRegex(
            ValidationError, r'staffer \(Line Manager: artur, Manager: marco\)',
        ):
            finalize_run(run, self.admin)
        run.refresh_from_db()
        self.assertEqual(run.status, 'draft')
        self.assertFalse(ApprovalPeriodCloseMember.objects.exists())

    def test_finalize_from_the_cutoff_closes_the_run_users_and_succeeds(self):
        run = self._september_run()
        with at(AT_CUTOFF):
            finalize_run(run, self.admin)
        run.refresh_from_db()
        self.assertEqual(run.status, 'finalized')
        self.assertTrue(ApprovalPeriodCloseMember.objects.filter(user=self.staffer).exists())
        # Payroll only sweeps its own run's users; the company-wide sweep is the job's.
        self.assertFalse(ApprovalPeriodCloseMember.objects.filter(user=self.bystander).exists())

    def test_a_tl_close_before_the_cutoff_still_unblocks_finalize(self):
        run = self._september_run()
        finalize_period(self.line_manager, date(2026, 9, 1))  # the Line Manager alone is enough
        with at(BEFORE_CUTOFF):
            finalize_run(run, self.admin)
        run.refresh_from_db()
        self.assertEqual(run.status, 'finalized')

    def test_scheduler_job_closes_everyone_only_once_the_cutoff_passed(self):
        with at(datetime(2026, 11, 1, 12, 0, tzinfo=TIRANE)):
            auto_finalize_previous_month()
        self.assertFalse(ApprovalPeriodCloseMember.objects.exists())

        with at(datetime(2026, 11, 2, 0, 0, tzinfo=TIRANE)):
            auto_finalize_previous_month()
        self.assertTrue(
            ApprovalPeriodCloseMember.objects.filter(
                user=self.bystander, close__boundary__period=date(2026, 10, 1),
            ).exists()
        )

    def test_plugin_registers_the_hourly_job(self):
        ((name, interval, target),) = PayrollPlugin().get_scheduled_jobs()
        self.assertEqual((name, interval), ('auto_finalize_periods', 3600))
        self.assertIs(import_string(target), auto_finalize_previous_month)
