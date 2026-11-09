"""Banded overtime pricing: rule-set fields, pure slicing, seed command."""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from plugins.payroll.models import PayrollRuleSet
from plugins.payroll.serializers import PayrollRuleSetCreateSerializer
from plugins.payroll.viewsets import PayrollRuleSetViewSet

BANDED = {
    'overtime_pricing': 'banded',
    'ot_premium': Decimal('0.25'),
    'weekend_holiday_premium': Decimal('0.25'),
    'evening_premium': Decimal('0.20'),
    'night_premium': Decimal('0.50'),
    'evening_start_hour': 18,
    'night_start_hour': 22,
    'night_end_hour': 6,
}


class RuleSetBandedFieldsTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_superuser(
            username='bands_admin', email='bands@example.com', password='pass',
        )
        self.factory = APIRequestFactory()

    def _post(self, path, data, action, **kwargs):
        request = self.factory.post(path, data=data, format='json')
        force_authenticate(request, user=self.user)
        return PayrollRuleSetViewSet.as_view({'post': action})(request, **kwargs)

    def _banded_set(self, **extra):
        return PayrollRuleSet.objects.create(
            code='BANDED_V1', name='Banded', version='1.0',
            effective_from=date(2026, 1, 1), **{**BANDED, **extra},
        )

    def test_new_rule_set_defaults_to_legacy_category_mode(self):
        rule_set = PayrollRuleSet.objects.create(
            code='LEGACY', name='Legacy', effective_from=date(2026, 1, 1),
        )
        self.assertEqual(rule_set.overtime_pricing, 'category')
        self.assertEqual(rule_set.ot_premium, Decimal('0'))
        self.assertEqual(
            (rule_set.evening_start_hour, rule_set.night_start_hour, rule_set.night_end_hour),
            (18, 22, 6),
        )

    def test_clone_copies_banded_fields(self):
        source = self._banded_set()
        response = self._post(
            '/rule-sets/1/clone/',
            {'code': 'BANDED_V2', 'version': '2.0', 'effective_from': '2026-07-01'},
            'clone', pk=source.pk,
        )
        self.assertEqual(response.status_code, 201)
        clone = PayrollRuleSet.objects.get(code='BANDED_V2')
        for field, value in BANDED.items():
            self.assertEqual(getattr(clone, field), value, field)

    def test_version_save_persists_banded_fields(self):
        source = self._banded_set()
        parent = {
            'code': 'BANDED_V3', 'name': 'Banded v3', 'version': '3.0', 'country': 'AL',
            'effective_from': '2026-08-01', 'is_active': True, 'tax_profile': 'standard',
            **{k: str(v) if isinstance(v, Decimal) else v for k, v in BANDED.items()},
        }
        response = self._post(
            '/rule-sets/1/atomic-save/',
            {'mode': 'version', 'parent_fields': parent, 'tax_brackets': [],
             'contribution_rates': [], 'overtime_categories': []},
            'atomic_save', pk=source.pk,
        )
        self.assertIn(response.status_code, (200, 201), response.data)
        created = PayrollRuleSet.objects.get(code='BANDED_V3')
        self.assertEqual(created.overtime_pricing, 'banded')
        self.assertEqual(created.night_premium, Decimal('0.50'))

    def test_banded_set_rejects_unordered_band_hours(self):
        serializer = PayrollRuleSetCreateSerializer(data={
            'code': 'BAD', 'name': 'Bad', 'version': '1.0', 'country': 'AL',
            'effective_from': '2026-01-01', 'is_active': True, 'tax_profile': 'standard',
            'overtime_pricing': 'banded', 'evening_start_hour': 23,
            'night_start_hour': 22, 'night_end_hour': 6,
        })
        self.assertFalse(serializer.is_valid())
        self.assertIn('evening_start_hour', serializer.errors)

    def test_banded_set_rejects_negative_premium(self):
        serializer = PayrollRuleSetCreateSerializer(data={
            'code': 'BAD2', 'name': 'Bad', 'version': '1.0', 'country': 'AL',
            'effective_from': '2026-01-01', 'is_active': True, 'tax_profile': 'standard',
            'overtime_pricing': 'banded', 'ot_premium': '-0.10',
        })
        self.assertFalse(serializer.is_valid())
        self.assertIn('ot_premium', serializer.errors)


# ---------------------------------------------------------------------------
# Pure slicing
# ---------------------------------------------------------------------------
from datetime import time  # noqa: E402

from django.test import SimpleTestCase  # noqa: E402

from plugins.payroll.services.overtime_bands import (  # noqa: E402
    OvertimeBandRules,
    slice_overtime_entry,
)

RULES = OvertimeBandRules(
    ot_premium=Decimal('0.25'), weekend_holiday_premium=Decimal('0.25'),
    evening_premium=Decimal('0.20'), night_premium=Decimal('0.50'),
    evening_start_hour=18, night_start_hour=22, night_end_hour=6,
)


def _slices(hours, start, end, wh=False):
    slices, warnings = slice_overtime_entry(Decimal(hours), start, end, wh, RULES)
    return [(s.code, s.hours, s.multiplier) for s in slices], warnings


class SliceOvertimeEntryTests(SimpleTestCase):
    def test_policy_matrix_12_cells(self):
        cases = [
            # (start, end, weekend_or_holiday, code, multiplier) - tables 2 and 4
            (time(9), time(10), False, 'ot_day', '1.25'),
            (time(20), time(21), False, 'ot_evening', '1.45'),
            (time(23), time(0), False, 'ot_night', '1.75'),
            (time(9), time(10), True, 'wh_ot_day', '1.50'),
            (time(20), time(21), True, 'wh_ot_evening', '1.70'),
            (time(23), time(0), True, 'wh_ot_night', '2.00'),
        ]
        for start, end, wh, code, multiplier in cases:
            with self.subTest(code=code):
                result, warnings = _slices('1', start, end, wh)
                self.assertEqual(result, [(code, Decimal('1'), Decimal(multiplier))])
                self.assertEqual(warnings, [])

    def test_weekday_17_to_19_splits_day_and_evening(self):
        result, _ = _slices('2', time(17), time(19))
        self.assertEqual(result, [
            ('ot_day', Decimal('1'), Decimal('1.25')),
            ('ot_evening', Decimal('1'), Decimal('1.45')),
        ])

    def test_sunday_20_to_midnight(self):
        result, _ = _slices('4', time(20), time(0), wh=True)
        self.assertEqual(result, [
            ('wh_ot_evening', Decimal('2'), Decimal('1.70')),
            ('wh_ot_night', Decimal('2'), Decimal('2.00')),
        ])

    def test_boundaries_belong_to_the_starting_minute(self):
        self.assertEqual([c for c, *_ in _slices('12', time(6), time(18))[0]], ['ot_day'])
        self.assertEqual([c for c, *_ in _slices('4', time(18), time(22))[0]], ['ot_evening'])
        self.assertEqual([c for c, *_ in _slices('8', time(22), time(6))[0]], ['ot_night'])

    def test_overnight_wraps_across_all_bands(self):
        result, _ = _slices('15', time(18), time(9))
        codes = {c: h for c, h, _ in result}
        self.assertEqual(codes, {'ot_day': Decimal('3'), 'ot_evening': Decimal('4'),
                                 'ot_night': Decimal('8')})

    def test_start_equals_end_is_a_24_hour_span(self):
        result, _ = _slices('24', time(9), time(9))
        self.assertEqual(sum(h for _, h, _ in result), Decimal('24'))
        self.assertEqual({c for c, *_ in result}, {'ot_day', 'ot_evening', 'ot_night'})

    def test_pro_rata_paid_share_across_a_boundary(self):
        result, _ = _slices('1', time(17, 30), time(18, 30))
        self.assertEqual(result, [
            ('ot_day', Decimal('0.5'), Decimal('1.25')),
            ('ot_evening', Decimal('0.5'), Decimal('1.45')),
        ])

    def test_paid_share_smaller_than_span_is_distributed_pro_rata(self):
        result, _ = _slices('1.5', time(17), time(20))
        self.assertEqual([(c, h) for c, h, _ in result],
                         [('ot_day', Decimal('0.5')), ('ot_evening', Decimal('1.0'))])

    def test_slice_hours_always_sum_to_entry_hours(self):
        result, _ = _slices('1', time(17, 20), time(19, 40))
        self.assertEqual(sum(h for _, h, _ in result), Decimal('1'))

    def test_missing_timestamps_price_whole_entry_in_day_band_with_warning(self):
        for start, end in ((None, None), (time(18), None), (None, time(20))):
            with self.subTest(start=start, end=end):
                result, warnings = _slices('2', start, end)
                self.assertEqual(result, [('ot_day', Decimal('2'), Decimal('1.25'))])
                self.assertEqual(len(warnings), 1)
                self.assertIn('missing', warnings[0].lower())

    def test_missing_timestamps_on_weekend_use_wh_day(self):
        result, _ = _slices('2', None, None, wh=True)
        self.assertEqual(result, [('wh_ot_day', Decimal('2'), Decimal('1.50'))])


# ---------------------------------------------------------------------------
# Calculator branch
# ---------------------------------------------------------------------------
from plugins.payroll.services.calculator import (  # noqa: E402
    OvertimeCategoryInput,
    OvertimeEntryInput,
    PayrollCalculationInput,
    calculate_payroll,
)

MONDAY, SUNDAY = date(2026, 1, 5), date(2026, 1, 4)
BASE = Decimal('70000') / Decimal('174')


def _calc(entries, rules=RULES, holidays=frozenset(), **overrides):
    values = dict(
        user_id=1, user_display='T', year=2026, month=1,
        gross_monthly_wage=Decimal('70000'), monthly_working_days=22,
        monthly_standard_hours=Decimal('174'), overtime_entries=entries,
        overtime_categories=[OvertimeCategoryInput('weekday_day', Decimal('1.25'), None, None, False, False)],
        rounding_mode='half_up', rounding_precision=2,
        holiday_dates=set(holidays), overtime_band_rules=rules,
    )
    values.update(overrides)
    return calculate_payroll(PayrollCalculationInput(**values))


class BandedCalculatorTests(SimpleTestCase):
    def test_legacy_path_when_no_band_rules(self):
        entry = OvertimeEntryInput(MONDAY, Decimal('2'), time(17), time(19), source_id=1)
        result = _calc([entry], rules=None)
        self.assertEqual(result.overtime_amount, (Decimal('2') * BASE * Decimal('1.25')).quantize(Decimal('0.01')))
        self.assertEqual([b.code for b in result.overtime_breakdown], ['weekday_day'])

    def test_weekday_17_to_19_example(self):
        entry = OvertimeEntryInput(MONDAY, Decimal('2'), time(17), time(19), source_id=1)
        result = _calc([entry])
        self.assertEqual(result.overtime_amount, Decimal('1086.21'))
        self.assertEqual({b.code: b.hours for b in result.overtime_breakdown},
                         {'ot_day': Decimal('1'), 'ot_evening': Decimal('1')})

    def test_sunday_20_to_24_example(self):
        entry = OvertimeEntryInput(SUNDAY, Decimal('4'), time(20), time(0), source_id=1)
        result = _calc([entry])
        self.assertEqual(result.overtime_amount, Decimal('2977.01'))

    def test_holiday_on_a_sunday_is_not_doubled(self):
        entry = OvertimeEntryInput(SUNDAY, Decimal('4'), time(9), time(13), source_id=1)
        on_sunday = _calc([entry])
        also_holiday = _calc([entry], holidays={SUNDAY})
        self.assertEqual(on_sunday.overtime_amount, also_holiday.overtime_amount)
        self.assertEqual(also_holiday.overtime_breakdown[0].multiplier, Decimal('1.50'))

    def test_holiday_on_a_weekday_gets_weekend_holiday_premium(self):
        entry = OvertimeEntryInput(MONDAY, Decimal('4'), time(9), time(13), source_id=1)
        result = _calc([entry], holidays={MONDAY})
        self.assertEqual([b.code for b in result.overtime_breakdown], ['wh_ot_day'])

    def test_breakdown_merges_same_code_across_entries(self):
        entries = [
            OvertimeEntryInput(MONDAY, Decimal('1'), time(9), time(10), source_id=1),
            OvertimeEntryInput(date(2026, 1, 6), Decimal('2'), time(10), time(12), source_id=2),
        ]
        result = _calc(entries)
        self.assertEqual(len(result.overtime_breakdown), 1)
        self.assertEqual(result.overtime_breakdown[0].hours, Decimal('3'))
        self.assertEqual(result.overtime_hours, Decimal('3'))

    def test_entry_detail_amount_is_sum_of_slices_and_lists_them(self):
        entry = OvertimeEntryInput(MONDAY, Decimal('2'), time(17), time(19), source_id=7)
        result = _calc([entry])
        detail = result.entry_details[0]
        self.assertEqual(Decimal(detail['amount']), BASE * Decimal('2.70'))
        self.assertEqual(Decimal(detail['hours']), Decimal('2'))
        self.assertEqual([s['code'] for s in detail['slices']], ['ot_day', 'ot_evening'])

    def test_missing_timestamps_warn_with_the_work_date(self):
        entry = OvertimeEntryInput(MONDAY, Decimal('2'), None, None, source_id=1)
        result = _calc([entry])
        self.assertEqual(result.overtime_amount, (Decimal('2') * BASE * Decimal('1.25')).quantize(Decimal('0.01')))
        self.assertTrue(any('2026-01-05' in w and 'missing' in w.lower() for w in result.warnings))

    def test_carried_over_entry_keeps_its_source_date_context(self):
        # A Sunday in January settled in the February run is still priced as weekend.
        entry = OvertimeEntryInput(SUNDAY, Decimal('1'), time(9), time(10), source_id=1,
                                   requested_period=date(2026, 2, 1))
        result = _calc([entry], month=2)
        self.assertEqual([b.code for b in result.overtime_breakdown], ['wh_ot_day'])


# ---------------------------------------------------------------------------
# Persistence wiring
# ---------------------------------------------------------------------------
from datetime import time as _time  # noqa: E402

from django.core.management import call_command  # noqa: E402

from apps.overtime.models import Client as OvertimeClient, OvertimeLog  # noqa: E402
from plugins.payroll.models import (  # noqa: E402
    PayrollConfiguration, PayrollRun, PayrollRunEntry, WageAssignment,
)
from plugins.payroll.services.payroll_service import finalize_run, generate_draft_run  # noqa: E402


class BandedRunPersistenceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        PayrollConfiguration.objects.update_or_create(
            pk=1, defaults={'require_tl_closed_before_finalize': False, 'rounding_precision': 2},
        )
        User = get_user_model()
        cls.admin = User.objects.create_superuser(username='bp_admin', email='bp@test.com', password='x')
        call_command('seed_payroll_rules', verbosity=0)
        cls.legacy = PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE')
        cls.banded = PayrollRuleSet.objects.create(
            code='BANDED_TEST', name='Banded', version='1.0', effective_from=date(2025, 1, 1),
            **BANDED,
        )
        for source, target in ((cls.legacy, cls.banded),):
            for bracket in source.tax_brackets.all():
                bracket.pk = None
                bracket.rule_set = target
                bracket.save()
            for contribution in source.contribution_rates.all():
                contribution.pk = None
                contribution.rule_set = target
                contribution.save()
        cls.client_obj = OvertimeClient.objects.create(name='BP Client', code='BPC')
        cls.employee = User.objects.create_user(username='bp-emp', password='x')
        WageAssignment.objects.create(
            user=cls.employee, gross_monthly_wage=Decimal('70000'),
            effective_from=date(2026, 1, 1), is_active=True,
        )
        for day, start, end in ((2, _time(17), _time(19)), (1, _time(20), _time(0))):
            OvertimeLog.objects.create(
                user=cls.employee, client=cls.client_obj, date=date(2026, 3, day),
                start_time=start, end_time=end, hours=1,
                requested_processing_period=date(2026, 3, 1), status='approved',
            )

    def _generate(self, rule_set, month=3):
        run = PayrollRun.objects.create(
            year=2026, month=month, status='draft', rule_set=rule_set, created_by=self.admin,
        )
        generate_draft_run(run, [self.employee])
        return run

    def test_banded_run_uses_band_codes_and_policy_amounts(self):
        run = self._generate(self.banded)
        line = run.lines.get()
        codes = {c['code'] for c in line.overtime_breakdown['categories']}
        self.assertEqual(codes, {'ot_day', 'ot_evening', 'wh_ot_evening', 'wh_ot_night'})
        self.assertEqual(line.overtime_amount, Decimal('1086.21') + Decimal('2977.01'))

    def test_ledger_keeps_one_row_per_source_entry_summing_the_slices(self):
        run = self._generate(self.banded)
        entries = PayrollRunEntry.objects.filter(run=run, source_kind='overtime')
        self.assertEqual(entries.count(), 2)
        total = sum(e.overtime_amount for e in entries)
        self.assertEqual(total.quantize(Decimal('0.01')), run.lines.get().overtime_amount)

    def test_finalize_freezes_the_same_amounts(self):
        run = self._generate(self.banded)
        draft_amount = run.lines.get().overtime_amount
        finalize_run(run, self.admin)
        run.refresh_from_db()
        self.assertEqual(run.status, 'finalized')
        self.assertEqual(run.lines.get().overtime_amount, draft_amount)

    def test_finalized_banded_run_exports_without_error(self):
        from plugins.payroll.services.export_service import (
            generate_payroll_excel, generate_payroll_pdf, generate_payslip_pdf,
        )
        run = self._generate(self.banded)
        finalize_run(run, self.admin)
        run.refresh_from_db()
        self.assertGreater(len(generate_payroll_excel(run).getvalue()), 1000)
        self.assertGreater(len(generate_payroll_pdf(run).getvalue()), 1000)
        self.assertGreater(len(generate_payslip_pdf(run.lines.get()).getvalue()), 1000)

    def test_category_mode_run_is_unchanged(self):
        run = self._generate(self.legacy)
        codes = {c['code'] for c in run.lines.get().overtime_breakdown['categories']}
        self.assertFalse(codes & {'ot_day', 'ot_evening', 'wh_ot_evening', 'wh_ot_night'})


# ---------------------------------------------------------------------------
# Seed command
# ---------------------------------------------------------------------------
from django.core.management.base import CommandError  # noqa: E402


class SeedBandedRulesCommandTests(TestCase):
    def setUp(self):
        call_command('seed_payroll_rules', verbosity=0)
        self.source = PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE')

    def _seed(self, effective_from='2026-12-01'):
        call_command('seed_payroll_banded_rules', effective_from=effective_from, verbosity=0)
        return PayrollRuleSet.objects.get(code=f'AL_BANDED_OT_{effective_from[:7].replace("-", "_")}')

    def test_creates_banded_set_with_policy_values_and_copied_children(self):
        new = self._seed()
        self.assertEqual(new.overtime_pricing, 'banded')
        self.assertEqual(
            (new.ot_premium, new.weekend_holiday_premium, new.evening_premium, new.night_premium),
            (Decimal('0.25'), Decimal('0.25'), Decimal('0.20'), Decimal('0.50')),
        )
        self.assertEqual((new.evening_start_hour, new.night_start_hour, new.night_end_hour), (18, 22, 6))
        self.assertEqual(new.validation_status, 'reference')
        self.assertEqual(new.effective_from, date(2026, 12, 1))
        self.assertEqual(new.tax_brackets.count(), self.source.tax_brackets.count())
        self.assertEqual(new.contribution_rates.count(), self.source.contribution_rates.count())
        self.assertEqual(new.overtime_categories.count(), self.source.overtime_categories.count())

    def test_source_set_is_never_modified(self):
        before = PayrollRuleSet.objects.filter(pk=self.source.pk).values().get()
        self._seed()
        self.assertEqual(PayrollRuleSet.objects.filter(pk=self.source.pk).values().get(), before)

    def test_is_idempotent(self):
        self._seed()
        self._seed()
        self.assertEqual(PayrollRuleSet.objects.filter(overtime_pricing='banded').count(), 1)

    def test_rejects_a_date_that_is_not_a_month_start(self):
        with self.assertRaises(CommandError):
            call_command('seed_payroll_banded_rules', effective_from='2026-12-15', verbosity=0)

    def test_rejects_an_effective_date_already_used_by_an_active_set(self):
        with self.assertRaises(CommandError):
            call_command('seed_payroll_banded_rules',
                         effective_from=self.source.effective_from.isoformat(), verbosity=0)


# ---------------------------------------------------------------------------
# Export labels
# ---------------------------------------------------------------------------
from types import SimpleNamespace  # noqa: E402

from plugins.payroll.services.export_service import _overtime_rows  # noqa: E402


class BandedExportRowsTests(SimpleTestCase):
    def test_band_codes_have_readable_labels_and_percent_multipliers(self):
        line = SimpleNamespace(total_gross=Decimal('1000'), overtime_breakdown={'categories': [
            {'code': 'ot_evening', 'hours': '1', 'multiplier': '1.45', 'amount': '100'},
            {'code': 'wh_ot_night', 'hours': '2', 'multiplier': '2.00', 'amount': '200'},
        ]})
        rows = _overtime_rows(line)
        self.assertEqual(
            [(r['label'], r['multiplier_pct']) for r in rows],
            [('Overtime — Evening', Decimal('145.00')), ('Weekend/Holiday Overtime — Night', Decimal('200.00'))],
        )

    def test_every_band_code_is_labelled(self):
        from plugins.payroll.services.export_service import OVERTIME_CATEGORY_LABELS
        for code in ('ot_day', 'ot_evening', 'ot_night', 'wh_ot_day', 'wh_ot_evening', 'wh_ot_night'):
            self.assertIn(code, OVERTIME_CATEGORY_LABELS)
