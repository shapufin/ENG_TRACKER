"""Backend review regressions (2026-10-18): input hardening, draft-vs-config
staleness, finalized-payslip branding immutability and disabled-plugin gates.

Written test-first; each class names the finding it pins.
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from plugins.payroll.models import (
    PayrollConfiguration, PayrollRun, PayrollRuleSet, WageAssignment,
)
from plugins.payroll.services.export_service import generate_payslip_pdf, run_branding
from plugins.payroll.services.payroll_service import (
    _snapshot_config, finalize_run, generate_draft_run,
)
from plugins.payroll.viewsets import PayrollRunViewSet, WageAssignmentViewSet

User = get_user_model()


class _PayrollFixture(TestCase):
    @classmethod
    def setUpTestData(cls):
        PayrollConfiguration.objects.update_or_create(
            pk=1, defaults={'require_tl_closed_before_finalize': False},
        )
        call_command('seed_payroll_rules', verbosity=0)
        cls.rule_set = PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE')
        cls.admin = User.objects.create_superuser(
            username='review_admin', email='review_admin@test.com', password='pass',
        )
        cls.employee = User.objects.create_user(username='review_emp', password='pass')
        cls.wage = WageAssignment.objects.create(
            user=cls.employee, gross_monthly_wage=Decimal('100000'),
            effective_from=date(2026, 1, 1), is_active=True,
        )

    def setUp(self):
        self.factory = APIRequestFactory()

    def _draft(self, month=6):
        run = PayrollRun.objects.create(
            year=2026, month=month, status='draft', rule_set=self.rule_set,
            created_by=self.admin,
        )
        generate_draft_run(run, [self.employee])
        return run


class DraftRunPeriodIsImmutableTests(_PayrollFixture):
    """F-A: PATCH on a draft run must not move it to another period (lines,
    entries and the one-active-run-per-period constraint all key on it)."""

    def test_patch_cannot_change_year_or_month(self):
        run = self._draft(month=6)
        request = self.factory.patch(
            f'/api/plugins/payroll/runs/{run.id}/', {'year': 2027, 'month': 7, 'notes': 'x'},
            format='json',
        )
        force_authenticate(request, user=self.admin)
        resp = PayrollRunViewSet.as_view({'patch': 'partial_update'})(request, pk=run.id)
        self.assertEqual(resp.status_code, 200)
        run.refresh_from_db()
        self.assertEqual((run.year, run.month), (2026, 6))
        self.assertEqual(run.notes, 'x')


class MalformedInputTests(_PayrollFixture):
    """F-B/F-G/F-H: garbage query/body values are 4xx, never a 500."""

    def test_payslip_non_numeric_line_id_is_4xx(self):
        run = self._draft()
        finalize_run(run, self.admin)
        request = self.factory.get(
            f'/api/plugins/payroll/runs/{run.id}/payslip/', {'line_id': 'abc'},
        )
        force_authenticate(request, user=self.admin)
        resp = PayrollRunViewSet.as_view({'get': 'payslip'})(request, pk=run.id)
        self.assertIn(resp.status_code, (400, 404))

    def test_wage_history_non_numeric_user_id_is_4xx(self):
        request = self.factory.get('/api/plugins/payroll/wages/history/', {'user_id': 'abc'})
        force_authenticate(request, user=self.admin)
        resp = WageAssignmentViewSet.as_view({'get': 'history'})(request)
        self.assertIn(resp.status_code, (400, 403, 404))

    def test_bulk_create_non_object_items_is_400(self):
        request = self.factory.post(
            '/api/plugins/payroll/wages/bulk_create/', {'assignments': ['x', 5]}, format='json',
        )
        force_authenticate(request, user=self.admin)
        resp = WageAssignmentViewSet.as_view({'post': 'bulk_create'})(request)
        self.assertEqual(resp.status_code, 400)

    def test_bulk_create_unhashable_user_is_400(self):
        request = self.factory.post(
            '/api/plugins/payroll/wages/bulk_create/',
            {'assignments': [{'user': {'a': 1}}, {'user': [1]}]}, format='json',
        )
        force_authenticate(request, user=self.admin)
        resp = WageAssignmentViewSet.as_view({'post': 'bulk_create'})(request)
        self.assertEqual(resp.status_code, 400)


class StaleDraftCannotFinalizeTests(_PayrollFixture):
    """F-E/F-C: a wage or calculation-config change after generation must not
    be finalized silently with the old numbers."""

    def test_finalize_blocked_when_wage_changed_after_generation(self):
        run = self._draft()
        WageAssignment.objects.filter(pk=self.wage.pk).update(gross_monthly_wage=Decimal('120000'))
        with self.assertRaises(ValidationError) as ctx:
            finalize_run(run, self.admin)
        self.assertIn('Regenerate', ctx.exception.messages[0])
        run.refresh_from_db()
        self.assertEqual(run.status, 'draft')

    def test_finalize_blocked_when_calculation_config_changed(self):
        run = self._draft()
        PayrollConfiguration.objects.filter(pk=1).update(rounding_mode='down')
        with self.assertRaises(ValidationError) as ctx:
            finalize_run(run, self.admin)
        self.assertIn('Regenerate', ctx.exception.messages[0])

    def test_finalize_allowed_when_only_gate_flag_or_branding_changed(self):
        run = self._draft()
        PayrollConfiguration.objects.filter(pk=1).update(
            require_tl_closed_before_finalize=False,
            organization_name='Renamed Org', payslip_footer='New footer',
        )
        finalize_run(run, self.admin)
        run.refresh_from_db()
        self.assertEqual(run.status, 'finalized')

    def test_scoped_regenerate_does_not_refresh_snapshot(self):
        """Regenerating a subset after a config change must not mask the
        staleness of the untouched lines by overwriting the run snapshot."""
        run = self._draft()
        before = dict(run.configuration_snapshot)
        PayrollConfiguration.objects.filter(pk=1).update(rounding_mode='down')
        generate_draft_run(run, [self.employee], replace_user_ids={self.employee.id})
        run.refresh_from_db()
        self.assertEqual(run.configuration_snapshot, before)


class FinalizedBrandingIsSnapshotTests(_PayrollFixture):
    """F-F: org name / footer on a finalized payslip come from the run's
    snapshot, so editing Settings later does not rewrite old payslips."""

    def test_snapshot_carries_branding(self):
        PayrollConfiguration.objects.filter(pk=1).update(
            organization_name='Acme', payslip_footer='Thanks',
        )
        snap = _snapshot_config(PayrollConfiguration.get_singleton())
        self.assertEqual(snap['organization_name'], 'Acme')
        self.assertEqual(snap['payslip_footer'], 'Thanks')

    def test_run_branding_prefers_snapshot_over_live_config(self):
        PayrollConfiguration.objects.filter(pk=1).update(
            organization_name='Acme', payslip_footer='Thanks',
        )
        run = self._draft()
        finalize_run(run, self.admin)
        PayrollConfiguration.objects.filter(pk=1).update(
            organization_name='Other', payslip_footer='Changed',
        )
        run.refresh_from_db()
        self.assertEqual(run_branding(run), ('Acme', 'Thanks'))

    def test_run_branding_falls_back_to_live_for_legacy_snapshot(self):
        PayrollConfiguration.objects.filter(pk=1).update(
            organization_name='Live', payslip_footer='LiveFooter',
        )
        run = self._draft()
        snap = dict(run.configuration_snapshot)
        snap.pop('organization_name', None)
        snap.pop('payslip_footer', None)
        PayrollRun.objects.filter(pk=run.pk).update(configuration_snapshot=snap)
        run.refresh_from_db()
        self.assertEqual(run_branding(run), ('Live', 'LiveFooter'))


class PdfMarkupSafetyTests(_PayrollFixture):
    """F-F: free text reaches ReportLab Paragraph, which parses markup. Broken
    or hostile markup must neither crash every payslip nor be interpreted."""

    def test_payslip_renders_with_markup_in_free_text(self):
        PayrollConfiguration.objects.filter(pk=1).update(
            organization_name='R&D <unclosed',
            payslip_footer='<img src="file:///etc/passwd"/> <b>x',
        )
        PayrollRuleSet.objects.filter(pk=self.rule_set.pk).update(name='Rules <i>&')
        run = self._draft()
        finalize_run(run, self.admin)
        line = run.lines.get(user=self.employee)
        data = generate_payslip_pdf(line)
        self.assertTrue(data.read(4) == b'%PDF')


class DisabledPluginImportGateTests(_PayrollFixture):
    """F-J: a disabled (not uninstalled) Payroll plugin must not keep writing
    wages through Data Import."""

    def test_wage_import_authority_denied_when_plugin_disabled(self):
        from apps.plugins.models import Plugin
        from plugins.data_import.importers.authority import PayrollAuthority

        Plugin.objects.update_or_create(
            name='payroll', defaults={'verbose_name': 'Payroll', 'is_enabled': False},
        )
        authority = PayrollAuthority()
        authority.display_name = 'wages'
        self.assertIsNotNone(authority.check_authority(self.admin))


class FinalizedSnapshotsSurviveUserDeletionTests(_PayrollFixture):
    """F-D: hard-deleting a user must not cascade away payroll lines (a
    base-wage-only user has no PROTECTing PayrollRunEntry)."""

    def test_deleting_user_with_payroll_line_is_blocked(self):
        from django.db.models import ProtectedError

        run = self._draft()
        finalize_run(run, self.admin)
        with self.assertRaises(ProtectedError):
            self.employee.delete()
        self.assertTrue(run.lines.filter(user=self.employee).exists())
