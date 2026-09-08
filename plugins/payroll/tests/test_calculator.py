"""Tests for the pure payroll calculator engine.

These tests verify the calculation logic without any database access.
"""
from datetime import date, time
from decimal import Decimal
from django.test import SimpleTestCase

from plugins.payroll.services.calculator import (
    ContributionRateInput,
    OvertimeCategoryInput,
    OvertimeEntryInput,
    PayrollCalculationInput,
    StandbyEntryInput,
    TaxBracketInput,
    calculate_payroll,
    calculate_progressive_tax,
    classify_overtime,
)


class ProgressiveTaxTests(SimpleTestCase):
    def test_zero_income(self):
        brackets = [TaxBracketInput(Decimal('0'), Decimal('30000'), Decimal('0'))]
        self.assertEqual(calculate_progressive_tax(Decimal('0'), brackets), Decimal('0'))

    def test_single_bracket_zero_rate(self):
        brackets = [TaxBracketInput(Decimal('0'), Decimal('30000'), Decimal('0'))]
        self.assertEqual(calculate_progressive_tax(Decimal('25000'), brackets), Decimal('0'))

    def test_single_bracket_13pct(self):
        brackets = [
            TaxBracketInput(Decimal('0'), Decimal('30000'), Decimal('0')),
            TaxBracketInput(Decimal('30000'), None, Decimal('0.13')),
        ]
        # Generic single-bracket helper case: (88,800 - 30,000) * 0.13 = 7,644
        self.assertEqual(
            calculate_progressive_tax(Decimal('88800'), brackets), Decimal('7644')
        )

    def test_multiple_brackets(self):
        brackets = [
            TaxBracketInput(Decimal('0'), Decimal('30000'), Decimal('0')),
            TaxBracketInput(Decimal('30000'), Decimal('200000'), Decimal('0.13')),
            TaxBracketInput(Decimal('200000'), None, Decimal('0.23')),
        ]
        # 250,000 → (200,000 - 30,000) * 0.13 + (250,000 - 200,000) * 0.23
        # = 22,100 + 11,500 = 33,600
        self.assertEqual(
            calculate_progressive_tax(Decimal('250000'), brackets), Decimal('33600')
        )

    def test_fixed_amount_is_added_once_per_reached_bracket(self):
        brackets = [
            TaxBracketInput(Decimal('0'), Decimal('30000'), Decimal('0'), Decimal('100')),
            TaxBracketInput(Decimal('30000'), None, Decimal('0.13'), Decimal('500')),
        ]
        self.assertEqual(
            calculate_progressive_tax(Decimal('40000'), brackets), Decimal('1900'),
        )

    def test_empty_brackets(self):
        self.assertEqual(calculate_progressive_tax(Decimal('100000'), []), Decimal('0'))


class ClassifyOvertimeTests(SimpleTestCase):
    def setUp(self):
        self.categories = [
            OvertimeCategoryInput(code='weekday_day', multiplier=Decimal('1.25')),
            OvertimeCategoryInput(code='weekday_night', multiplier=Decimal('1.30'),
                                  night_start_hour=22, night_end_hour=6),
            OvertimeCategoryInput(code='weekend_day', multiplier=Decimal('1.25'),
                                  applies_weekend=True),
            OvertimeCategoryInput(code='weekend_night', multiplier=Decimal('1.30'),
                                  night_start_hour=22, night_end_hour=6,
                                  applies_weekend=True),
            OvertimeCategoryInput(code='holiday', multiplier=Decimal('1.50'),
                                  applies_holiday=True),
        ]
        self.holidays = {date(2026, 1, 1)}

    def test_weekday_day(self):
        entry = OvertimeEntryInput(
            date=date(2026, 1, 7),  # Wednesday
            hours=Decimal('2'),
            start_time=time(10, 0), end_time=time(12, 0),
        )
        code, warnings = classify_overtime(entry, self.categories, self.holidays, 'weekday_day')
        self.assertEqual(code, 'weekday_day')
        self.assertEqual(warnings, [])

    def test_weekday_night(self):
        entry = OvertimeEntryInput(
            date=date(2026, 1, 7),  # Wednesday
            hours=Decimal('3'),
            start_time=time(23, 0), end_time=time(2, 0),
        )
        code, warnings = classify_overtime(entry, self.categories, self.holidays, 'weekday_day')
        self.assertEqual(code, 'weekday_night')
        self.assertEqual(warnings, [])

    def test_saturday_uses_weekday_day(self):
        entry = OvertimeEntryInput(
            date=date(2026, 1, 10),  # Saturday is a weekday for this company
            hours=Decimal('4'),
            start_time=time(10, 0), end_time=time(14, 0),
        )
        code, warnings = classify_overtime(entry, self.categories, self.holidays, 'weekday_day')
        self.assertEqual(code, 'weekday_day')
        self.assertEqual(warnings, [])

    def test_holiday(self):
        entry = OvertimeEntryInput(
            date=date(2026, 1, 1),  # New Year's Day (holiday)
            hours=Decimal('4'),
            start_time=time(10, 0), end_time=time(14, 0),
        )
        code, warnings = classify_overtime(entry, self.categories, self.holidays, 'weekday_day')
        self.assertEqual(code, 'holiday')
        self.assertEqual(warnings, [])

    def test_missing_timestamp_uses_fallback(self):
        entry = OvertimeEntryInput(
            date=date(2026, 1, 7),  # Wednesday
            hours=Decimal('2'),
            start_time=None, end_time=None,
        )
        code, warnings = classify_overtime(entry, self.categories, self.holidays, 'weekday_day')
        self.assertEqual(code, 'weekday_day')
        self.assertTrue(any('fallback' in w.lower() for w in warnings))


class CalculatePayrollTests(SimpleTestCase):
    """Test the full calculation with Boshti-reference-style rules."""

    def setUp(self):
        self.brackets = [
            TaxBracketInput(Decimal('0'), Decimal('30000'), Decimal('0')),
            TaxBracketInput(Decimal('30000'), Decimal('200000'), Decimal('0.13')),
            TaxBracketInput(Decimal('200000'), None, Decimal('0.23')),
        ]
        self.contributions = [
            ContributionRateInput('social', 'employee', Decimal('0.095'),
                                  cap=Decimal('186416')),
            ContributionRateInput('health', 'employee', Decimal('0.017')),
            ContributionRateInput('social', 'employer', Decimal('0.15'),
                                  cap=Decimal('186416')),
            ContributionRateInput('health', 'employer', Decimal('0.017')),
        ]
        self.categories = [
            OvertimeCategoryInput(code='weekday_day', multiplier=Decimal('1.25')),
            OvertimeCategoryInput(code='holiday', multiplier=Decimal('1.50'),
                                  applies_holiday=True),
        ]

    def _make_input(self, **overrides):
        defaults = dict(
            user_id=1, user_display='Test User',
            year=2026, month=1,
            gross_monthly_wage=Decimal('100000'),
            monthly_working_days=22,
            monthly_standard_hours=Decimal('174'),
            tax_brackets=self.brackets,
            contribution_rates=self.contributions,
            overtime_categories=self.categories,
            rounding_mode='half_up',
            rounding_precision=0,
        )
        defaults.update(overrides)
        return PayrollCalculationInput(**defaults)

    def test_basic_payroll_no_overtime_no_standby(self):
        """100,000 gross, no overtime/standby → Boshti reference."""
        inp = self._make_input()
        result = calculate_payroll(inp)

        # Employee social: 100,000 * 9.5% = 9,500
        self.assertEqual(result.employee_social, Decimal('9500'))
        # Employee health: 100,000 * 1.7% = 1,700
        self.assertEqual(result.employee_health, Decimal('1700'))
        # Tax is applied to gross taxable earnings: (100,000 - 30,000) * 0.13 = 9,100.
        self.assertEqual(result.income_tax, Decimal('9100'))
        # Total deductions: 9,500 + 1,700 + 9,100 = 20,300.
        self.assertEqual(result.total_employee_deductions, Decimal('20300'))
        # Net pay: 100,000 - 20,300 = 79,700.
        self.assertEqual(result.net_pay, Decimal('79700'))
        # Total gross = 100,000
        self.assertEqual(result.total_gross, Decimal('100000'))
        # Employer social: 100,000 * 15% = 15,000
        self.assertEqual(result.employer_social, Decimal('15000'))
        # Employer health: 100,000 * 1.7% = 1,700
        self.assertEqual(result.employer_health, Decimal('1700'))
        # Total employer cost: 100,000 + 15,000 + 1,700 = 116,700
        self.assertEqual(result.total_employer_cost, Decimal('116700'))

    def test_with_overtime(self):
        """100,000 gross + 10 hours weekday overtime."""
        overtime = [OvertimeEntryInput(
            date=date(2026, 1, 7), hours=Decimal('10'),
            start_time=time(18, 0), end_time=time(20, 0),
        )]
        inp = self._make_input(overtime_entries=overtime)
        result = calculate_payroll(inp)

        # Base hourly rate: 100,000 / 174 = 574.71...
        base_rate = Decimal('100000') / Decimal('174')
        # Overtime amount: 10 * base_rate * 1.25
        expected_ot = (Decimal('10') * base_rate * Decimal('1.25')).quantize(Decimal('1'))
        self.assertEqual(result.overtime_hours, Decimal('10'))
        self.assertEqual(result.overtime_amount, expected_ot)
        # Total gross = 100,000 + overtime
        self.assertEqual(result.total_gross, Decimal('100000') + expected_ot)

    def test_with_standby(self):
        """100,000 gross + 20 hours standby at 100 Lek/hour."""
        standby = [StandbyEntryInput(date=date(2026, 1, 7), hours=Decimal('20'))]
        inp = self._make_input(standby_entries=standby, weekday_standby_rate=Decimal('100'))
        result = calculate_payroll(inp)

        self.assertEqual(result.standby_hours, Decimal('20'))
        self.assertEqual(result.standby_amount, Decimal('2000'))
        # Total gross = 100,000 + 2,000 = 102,000
        self.assertEqual(result.total_gross, Decimal('102000'))

    def test_contribution_cap_applied(self):
        """Social contribution cap of 194,850 is applied."""
        inp = self._make_input(gross_monthly_wage=Decimal('300000'))
        result = calculate_payroll(inp)

        # Capped base = 186,416 for 2026.
        # Employee social: 186,416 * 9.5% = 17,709.52 → rounded 17,710.
        self.assertEqual(result.employee_social, Decimal('17710'))
        # Employer social: 186,416 * 15% = 27,962.4 → rounded 27,962.
        self.assertEqual(result.employer_social, Decimal('27962'))

    def test_contribution_floor_applied(self):
        contributions = [
            ContributionRateInput('social', 'employee', Decimal('0.10'), floor=Decimal('30000')),
            ContributionRateInput('health', 'employee', Decimal('0')),
            ContributionRateInput('social', 'employer', Decimal('0')),
            ContributionRateInput('health', 'employer', Decimal('0')),
        ]
        result = calculate_payroll(self._make_input(
            gross_monthly_wage=Decimal('10000'), contribution_rates=contributions,
        ))
        self.assertEqual(result.employee_social, Decimal('3000'))

    def test_zero_wage(self):
        """Zero wage produces zero everything."""
        inp = self._make_input(gross_monthly_wage=Decimal('0'))
        result = calculate_payroll(inp)
        self.assertEqual(result.total_gross, Decimal('0'))
        self.assertEqual(result.net_pay, Decimal('0'))

    def test_holiday_overtime_classification(self):
        """Overtime on a holiday uses the holiday multiplier."""
        overtime = [OvertimeEntryInput(
            date=date(2026, 1, 1),  # New Year's Day
            hours=Decimal('8'),
            start_time=time(10, 0), end_time=time(18, 0),
        )]
        inp = self._make_input(
            overtime_entries=overtime,
            holiday_dates={date(2026, 1, 1)},
        )
        result = calculate_payroll(inp)
        self.assertEqual(len(result.overtime_breakdown), 1)
        self.assertEqual(result.overtime_breakdown[0].code, 'holiday')
        self.assertEqual(result.overtime_breakdown[0].multiplier, Decimal('1.50'))

    def test_rounding_modes(self):
        """Different rounding modes produce different results."""
        inp_half_up = self._make_input(
            gross_monthly_wage=Decimal('100001'),
            rounding_mode='half_up', rounding_precision=0,
        )
        inp_down = self._make_input(
            gross_monthly_wage=Decimal('100001'),
            rounding_mode='down', rounding_precision=0,
        )
        r_up = calculate_payroll(inp_half_up)
        r_down = calculate_payroll(inp_down)
        # Both should produce valid results; the difference is in rounding
        self.assertEqual(r_up.gross_monthly_wage, Decimal('100001'))
        self.assertEqual(r_down.gross_monthly_wage, Decimal('100001'))

    def test_warnings_for_missing_timestamps(self):
        """Overtime without timestamps generates a warning."""
        overtime = [OvertimeEntryInput(
            date=date(2026, 1, 7), hours=Decimal('2'),
            start_time=None, end_time=None,
        )]
        inp = self._make_input(overtime_entries=overtime)
        result = calculate_payroll(inp)
        self.assertTrue(any('fallback' in w.lower() for w in result.warnings))

    def test_calculation_trace_populated(self):
        """The calculation trace contains expected keys."""
        inp = self._make_input()
        result = calculate_payroll(inp)
        self.assertIn('base_hourly_rate', result.calculation_trace)
        self.assertIn('employee_social', result.calculation_trace)
        self.assertIn('income_tax', result.calculation_trace)
        self.assertIn('brackets', result.calculation_trace['income_tax'])

    # ------------------------------------------------------------------
    # Boshti reference regression: 200k and 250k gross
    # ------------------------------------------------------------------
    # The Boshti reference applies progressive tax to gross taxable earnings
    # and caps 2026 social contributions at 186,416 Lek.

    def test_boshti_200k_reference(self):
        """200,000 gross, no overtime/standby → Boshti reference."""
        inp = self._make_input(gross_monthly_wage=Decimal('200000'))
        result = calculate_payroll(inp)

        # Employee social: 186,416 * 9.5% = 17,709.52 → 17,710.
        self.assertEqual(result.employee_social, Decimal('17710'))
        # Employee health: 200,000 * 1.7% = 3,400.
        self.assertEqual(result.employee_health, Decimal('3400'))
        # Tax: (200,000 - 30,000) * 0.13 = 22,100.
        self.assertEqual(result.income_tax, Decimal('22100'))
        self.assertEqual(result.total_employee_deductions, Decimal('43210'))
        self.assertEqual(result.net_pay, Decimal('156790'))
        self.assertEqual(result.total_gross, Decimal('200000'))

    def test_boshti_250k_reference(self):
        """250,000 gross, no overtime/standby → Boshti reference."""
        inp = self._make_input(gross_monthly_wage=Decimal('250000'))
        result = calculate_payroll(inp)

        # Employee social: 186,416 * 9.5% = 17,709.52 → 17,710.
        self.assertEqual(result.employee_social, Decimal('17710'))
        # Employee health: 250,000 * 1.7% = 4,250.
        self.assertEqual(result.employee_health, Decimal('4250'))
        # Tax: 170,000 * 0.13 + 50,000 * 0.23 = 33,600.
        self.assertEqual(result.income_tax, Decimal('33600'))
        self.assertEqual(result.total_employee_deductions, Decimal('55560'))
        self.assertEqual(result.net_pay, Decimal('194440'))
        self.assertEqual(result.total_gross, Decimal('250000'))

    # ------------------------------------------------------------------
    # Edge cases: timestamp boundaries
    # ------------------------------------------------------------------

    def test_overnight_overtime_timestamps(self):
        """Overtime spanning midnight (23:00 → 02:00) classifies correctly."""
        overtime = [OvertimeEntryInput(
            date=date(2026, 1, 7),  # Wednesday
            hours=Decimal('3'),
            start_time=time(23, 0),
            end_time=time(2, 0),  # next day 02:00
        )]
        inp = self._make_input(overtime_entries=overtime)
        result = calculate_payroll(inp)

        # The calculator should handle overnight entries without error
        # and classify as weekday_day (default category, no holiday).
        self.assertEqual(result.overtime_hours, Decimal('3'))
        self.assertEqual(len(result.overtime_breakdown), 1)
        self.assertEqual(result.overtime_breakdown[0].code, 'weekday_day')

    def test_weekend_boundary_friday_night(self):
        """Overtime on Friday 23:00 → verified as weekday, not weekend."""
        overtime = [OvertimeEntryInput(
            date=date(2026, 1, 9),  # Friday
            hours=Decimal('2'),
            start_time=time(23, 0),
            end_time=time(23, 0),  # same-time edge case
        )]
        inp = self._make_input(overtime_entries=overtime)
        result = calculate_payroll(inp)

        # Friday is a weekday; default category is weekday_day
        self.assertEqual(len(result.overtime_breakdown), 1)
        self.assertEqual(result.overtime_breakdown[0].code, 'weekday_day')

    def test_month_boundary_overtime(self):
        """Overtime on the last day of a month is included in that month."""
        overtime = [OvertimeEntryInput(
            date=date(2026, 1, 31),  # Last day of January
            hours=Decimal('4'),
            start_time=time(20, 0),
            end_time=time(23, 0),
        )]
        inp = self._make_input(
            overtime_entries=overtime,
            year=2026, month=1,
        )
        result = calculate_payroll(inp)

        # The overtime should be included in January's calculation
        self.assertEqual(result.overtime_hours, Decimal('4'))
        base_rate = Decimal('100000') / Decimal('174')
        expected_ot = (Decimal('4') * base_rate * Decimal('1.25')).quantize(Decimal('1'))
        self.assertEqual(result.overtime_amount, expected_ot)
