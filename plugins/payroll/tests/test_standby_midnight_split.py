"""Pins the pay effect of the weekly generator's midnight split (handover 2026-11-16, section 8).

The calculator prices a standby row by its date and hours only. Splitting a night at
midnight therefore moves its morning hours to the next date's rate:
  - Saturday night -> Sunday morning: the 9h move from the weekday rate to the weekend rate.
  - Sunday night -> Monday morning: the 9h move from the weekend rate to the weekday rate.
Saturday is a weekday for standby pay (``_is_weekend`` is Sunday only).
"""
from datetime import date
from decimal import Decimal

from django.test import SimpleTestCase

from plugins.payroll.services.calculator import (
    PayrollCalculationInput,
    StandbyEntryInput,
    TaxBracketInput,
    calculate_payroll,
)

WEEKDAY_RATE = Decimal('100')
WEEKEND_RATE = Decimal('200')
SATURDAY = date(2026, 11, 21)
SUNDAY = date(2026, 11, 22)
MONDAY = date(2026, 11, 23)


def standby_amount(*rows):
    inp = PayrollCalculationInput(
        user_id=1, user_display='T', year=2026, month=11,
        gross_monthly_wage=Decimal('100000'), monthly_working_days=22,
        monthly_standard_hours=Decimal('174'),
        tax_brackets=[TaxBracketInput(Decimal('0'), None, Decimal('0'))],
        contribution_rates=[], overtime_categories=[],
        rounding_mode='half_up', rounding_precision=0,
        standby_entries=[StandbyEntryInput(date=d, hours=Decimal(h)) for d, h in rows],
        weekday_standby_rate=WEEKDAY_RATE, weekend_standby_rate=WEEKEND_RATE,
    )
    return calculate_payroll(inp).standby_amount


class StandbyMidnightSplitPayTests(SimpleTestCase):
    def test_saturday_night_pays_more_after_the_split(self):
        old = standby_amount((SATURDAY, '15'))
        new = standby_amount((SATURDAY, '6'), (SUNDAY, '9'))
        self.assertEqual(old, Decimal('1500'))
        self.assertEqual(new, Decimal('600') + Decimal('1800'))
        self.assertGreater(new, old)

    def test_sunday_night_pays_less_after_the_split(self):
        old = standby_amount((SUNDAY, '15'))
        new = standby_amount((SUNDAY, '6'), (MONDAY, '9'))
        self.assertEqual(old, Decimal('3000'))
        self.assertEqual(new, Decimal('1200') + Decimal('900'))
        self.assertLess(new, old)
