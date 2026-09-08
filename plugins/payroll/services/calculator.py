"""
Pure payroll calculation engine.

This module contains NO database access and NO Django model dependencies
beyond plain dataclasses. It takes typed inputs and returns typed results.
Persistence is handled by the caller (``payroll_service.py``).

The calculation sequence:
1. Validate inputs (wage, rule set, calendar).
2. Compute base hourly rate from gross monthly wage and monthly hours.
3. Classify and calculate overtime by category.
4. Calculate standby at the configured Lek/hour rate.
5. Build taxable/contribution base from earning-type flags.
6. Apply employee social + health contributions.
7. Apply progressive income tax.
8. Apply employer social + health contributions.
9. Round per the configured policy.
10. Return the detailed result with warnings and trace.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, time
from decimal import Decimal, ROUND_HALF_UP, ROUND_HALF_EVEN, ROUND_DOWN
from typing import Optional


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class OvertimeEntryInput:
    """One approved overtime entry for calculation."""
    date: date
    hours: Decimal
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    source_id: Optional[int] = None
    requested_period: Optional[date] = None
    source_status: str = 'approved'


@dataclass
class StandbyEntryInput:
    """One approved standby entry for calculation."""
    date: date
    hours: Decimal
    source_id: Optional[int] = None
    requested_period: Optional[date] = None
    source_status: str = 'approved'


@dataclass
class TaxBracketInput:
    lower_bound: Decimal
    upper_bound: Optional[Decimal]
    rate: Decimal
    fixed_amount: Decimal = Decimal('0')


@dataclass
class ContributionRateInput:
    contribution_type: str  # 'social' or 'health'
    side: str  # 'employee' or 'employer'
    rate: Decimal
    cap: Optional[Decimal] = None
    floor: Optional[Decimal] = None


@dataclass
class OvertimeCategoryInput:
    code: str
    multiplier: Decimal
    night_start_hour: Optional[int] = None
    night_end_hour: Optional[int] = None
    applies_weekend: bool = False
    applies_holiday: bool = False


@dataclass
class PayrollCalculationInput:
    """All inputs needed to calculate one employee's payroll for one month."""
    user_id: int
    user_display: str
    year: int
    month: int
    gross_monthly_wage: Decimal
    monthly_working_days: int
    monthly_standard_hours: Decimal
    overtime_entries: list[OvertimeEntryInput] = field(default_factory=list)
    standby_entries: list[StandbyEntryInput] = field(default_factory=list)
    weekday_standby_rate: Decimal = Decimal('0')
    weekend_standby_rate: Decimal = Decimal('0')
    # Rule set
    tax_brackets: list[TaxBracketInput] = field(default_factory=list)
    contribution_rates: list[ContributionRateInput] = field(default_factory=list)
    overtime_categories: list[OvertimeCategoryInput] = field(default_factory=list)
    # Config
    rounding_mode: str = 'half_up'
    rounding_precision: int = 0
    missing_timestamp_fallback_category: str = 'weekday_day'
    # Calendar
    holiday_dates: set[date] = field(default_factory=set)
    # Earning-type taxable flags
    overtime_is_taxable: bool = True
    standby_is_taxable: bool = True
    overtime_is_contribution_bearing: bool = True
    standby_is_contribution_bearing: bool = True
    # Metadata
    rule_set_code: str = ''
    rule_set_version: str = ''


@dataclass
class OvertimeCategoryResult:
    code: str
    hours: Decimal
    multiplier: Decimal
    amount: Decimal


@dataclass
class PayrollCalculationResult:
    """Complete calculation result for one employee."""
    user_id: int
    user_display: str
    year: int
    month: int

    # Inputs
    gross_monthly_wage: Decimal
    monthly_working_days: int
    monthly_standard_hours: Decimal
    base_hourly_rate: Decimal

    # Overtime
    overtime_hours: Decimal
    overtime_amount: Decimal
    overtime_breakdown: list[OvertimeCategoryResult]

    # Standby
    standby_hours: Decimal
    standby_amount: Decimal

    # Totals
    total_gross: Decimal
    taxable_base: Decimal
    contribution_base: Decimal

    # Employee deductions
    employee_social: Decimal
    employee_health: Decimal
    income_tax: Decimal
    total_employee_deductions: Decimal
    net_pay: Decimal

    # Employer
    employer_social: Decimal
    employer_health: Decimal
    total_employer_cost: Decimal

    # Metadata
    warnings: list[str]
    calculation_trace: dict
    rule_set_code: str
    rule_set_version: str
    carryover_breakdown: dict = field(default_factory=dict)
    entry_details: list[dict] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_ROUNDING_MAP = {
    'half_up': ROUND_HALF_UP,
    'half_even': ROUND_HALF_EVEN,
    'down': ROUND_DOWN,
}


def _round(value: Decimal, mode: str, precision: int) -> Decimal:
    """Round a Decimal to the configured precision."""
    quant = Decimal('1e-{}'.format(precision)) if precision > 0 else Decimal('1')
    rounding = _ROUNDING_MAP.get(mode, ROUND_HALF_UP)
    return value.quantize(quant, rounding=rounding)


def _is_weekend(d: date) -> bool:
    """Return whether a date uses the company's weekend rate.

    Saturday is treated as a weekday for overtime and standby. Sunday remains
    the only weekend day for the current company policy.
    """
    return d.weekday() == 6  # 6=Sunday; Saturday uses weekday rates


def _is_night(t_start: Optional[time], t_end: Optional[time],
              night_start: Optional[int], night_end: Optional[int]) -> bool:
    """Determine if a time range falls in the night window.

    Night is typically 22:00–06:00 in Albanian labour code. If either
    timestamp is missing, returns False (caller handles fallback).
    """
    if t_start is None or t_end is None:
        return False
    if night_start is None or night_end is None:
        return False
    start_h = t_start.hour
    # Night if start hour >= night_start or < night_end
    return start_h >= night_start or start_h < night_end


# ---------------------------------------------------------------------------
# Overtime classification
# ---------------------------------------------------------------------------

def classify_overtime(entry: OvertimeEntryInput,
                      categories: list[OvertimeCategoryInput],
                      holiday_dates: set[date],
                      fallback_code: str) -> tuple[str, list[str]]:
    """Classify one overtime entry into a category code.

    Returns (category_code, warnings).
    """
    warnings: list[str] = []
    is_holiday = entry.date in holiday_dates
    is_weekend = _is_weekend(entry.date)
    missing_timestamps = entry.start_time is None or entry.end_time is None

    # Build a lookup by code
    by_code = {c.code: c for c in categories}

    # Try to classify by holiday first (highest priority)
    if is_holiday:
        holiday_cat = next((c for c in categories if c.applies_holiday), None)
        if holiday_cat:
            return holiday_cat.code, warnings

    # Weekend
    if is_weekend:
        # Check if night
        weekend_night = next((c for c in categories
                              if c.applies_weekend and c.code == 'weekend_night'), None)
        weekend_day = next((c for c in categories
                            if c.applies_weekend and c.code == 'weekend_day'), None)
        if weekend_night and _is_night(entry.start_time, entry.end_time,
                                       weekend_night.night_start_hour,
                                       weekend_night.night_end_hour):
            return weekend_night.code, warnings
        if weekend_day:
            return weekend_day.code, warnings

    # Weekday — check night vs day
    weekday_night = by_code.get('weekday_night')
    weekday_day = by_code.get('weekday_day')

    if weekday_night and _is_night(entry.start_time, entry.end_time,
                                   weekday_night.night_start_hour,
                                   weekday_night.night_end_hour):
        return weekday_night.code, warnings

    if weekday_day:
        if missing_timestamps:
            warnings.append(
                f'Overtime on {entry.date}: missing start/end time, '
                f'used fallback category "{weekday_day.code}".'
            )
        return weekday_day.code, warnings

    # Fallback
    if fallback_code not in by_code:
        warnings.append(
            f'Overtime on {entry.date}: no matching category and fallback '
            f'"{fallback_code}" not found; used first available category.'
        )
        if categories:
            return categories[0].code, warnings
        warnings.append(f'Overtime on {entry.date}: no overtime categories defined at all.')
        return 'weekday_day', warnings

    if entry.start_time is None or entry.end_time is None:
        warnings.append(
            f'Overtime on {entry.date}: missing start/end time, '
            f'used fallback category "{fallback_code}".'
        )
    return fallback_code, warnings


# ---------------------------------------------------------------------------
# Tax calculation
# ---------------------------------------------------------------------------

def calculate_progressive_tax(taxable_income: Decimal,
                              brackets: list[TaxBracketInput]) -> Decimal:
    """Calculate progressive income tax using ordered brackets.

    Each bracket applies its rate to the portion of income within
    [lower_bound, upper_bound). ``fixed_amount`` is added once if
    the income reaches the bracket's lower_bound.
    """
    if not brackets:
        return Decimal('0')

    tax = Decimal('0')
    sorted_brackets = sorted(brackets, key=lambda b: b.lower_bound)

    for bracket in sorted_brackets:
        upper = bracket.upper_bound if bracket.upper_bound is not None else Decimal('Infinity')
        if taxable_income <= bracket.lower_bound:
            break
        taxable_in_bracket = min(taxable_income, upper) - bracket.lower_bound
        if taxable_in_bracket > 0:
            tax += taxable_in_bracket * bracket.rate
            # fixed_amount is added once when income reaches this bracket
            tax += bracket.fixed_amount

    return tax


# ---------------------------------------------------------------------------
# Contribution calculation
# ---------------------------------------------------------------------------

def _get_contribution(rates: list[ContributionRateInput],
                      contribution_type: str, side: str) -> Optional[ContributionRateInput]:
    for r in rates:
        if r.contribution_type == contribution_type and r.side == side:
            return r
    return None


def _apply_cap_floor(base: Decimal, rate_input: Optional[ContributionRateInput]) -> Decimal:
    """Apply cap and floor to the contribution base, then return the
    capped base (not the contribution amount)."""
    if rate_input is None:
        return Decimal('0')
    capped_base = base
    if rate_input.floor is not None and capped_base < rate_input.floor:
        capped_base = rate_input.floor
    if rate_input.cap is not None and capped_base > rate_input.cap:
        capped_base = rate_input.cap
    return capped_base


# ---------------------------------------------------------------------------
# Main calculation
# ---------------------------------------------------------------------------

def calculate_payroll(inp: PayrollCalculationInput) -> PayrollCalculationResult:
    """Calculate payroll for one employee for one month.

    Pure function — no side effects, no database access.
    """
    warnings: list[str] = []
    trace: dict = {}

    # --- 1. Validate ---
    if inp.gross_monthly_wage < 0:
        warnings.append('Gross monthly wage is negative.')
    if inp.monthly_standard_hours <= 0:
        warnings.append('Monthly standard hours is zero; using 174 as fallback.')
        inp = PayrollCalculationInput(  # rebuild with fallback
            **{**inp.__dict__, 'monthly_standard_hours': Decimal('174')}
        )
    # Defense-in-depth: clamp negative hours/rates to zero.
    # The source models (OvertimeLog/StandbyLog) validate hours > 0 in save(),
    # but bulk_create bypasses save(), and the calculator is a pure function
    # that could be called with arbitrary inputs.
    if inp.weekday_standby_rate < 0:
        warnings.append('Weekday standby rate is negative; using 0.')
        inp = PayrollCalculationInput(
            **{**inp.__dict__, 'weekday_standby_rate': Decimal('0')}
        )
    if inp.weekend_standby_rate < 0:
        warnings.append('Weekend standby rate is negative; using 0.')
        inp = PayrollCalculationInput(
            **{**inp.__dict__, 'weekend_standby_rate': Decimal('0')}
        )
    # Filter out entries with non-positive hours (defense-in-depth)
    overtime_entries = [e for e in inp.overtime_entries if e.hours > 0]
    if len(overtime_entries) != len(inp.overtime_entries):
        warnings.append(
            f'{len(inp.overtime_entries) - len(overtime_entries)} overtime '
            f'entr(y/ies) with non-positive hours were skipped.'
        )
    standby_entries = [e for e in inp.standby_entries if e.hours > 0]
    if len(standby_entries) != len(inp.standby_entries):
        warnings.append(
            f'{len(inp.standby_entries) - len(standby_entries)} standby '
            f'entr(y/ies) with non-positive hours were skipped.'
        )

    # --- 2. Base hourly rate ---
    base_hourly_rate = (
        inp.gross_monthly_wage / inp.monthly_standard_hours
        if inp.monthly_standard_hours > 0 else Decimal('0')
    )
    trace['base_hourly_rate'] = str(base_hourly_rate)

    # --- 3. Overtime ---
    overtime_breakdown: list[OvertimeCategoryResult] = []
    by_code = {c.code: c for c in inp.overtime_categories}
    total_overtime_hours = Decimal('0')
    total_overtime_amount = Decimal('0')
    carryover = {}
    entry_details: list[dict] = []

    def record_entry(kind, entry, amount, category=None):
        source_period = entry.date.replace(day=1)
        requested_period = entry.requested_period or source_period
        resolved_period = date(inp.year, inp.month, 1)
        carried = requested_period != source_period
        detail = {
            'source_kind': kind,
            'source_id': entry.source_id,
            'work_date': entry.date.isoformat(),
            'requested_period': requested_period.isoformat(),
            'resolved_period': resolved_period.isoformat(),
            'resolution_reason': 'target_finalized' if requested_period < resolved_period else 'normal',
            'hours': str(entry.hours),
            'source_status': entry.source_status,
            'amount': str(amount),
            'category': category,
        }
        entry_details.append(detail)
        if carried:
            key = f'{source_period.isoformat()}:{requested_period.isoformat()}'
            bucket = carryover.setdefault(key, {
                'from_period': source_period.isoformat(),
                'requested_period': requested_period.isoformat(),
                'resolved_period': resolved_period.isoformat(),
                'resolution_reason': 'target_finalized' if requested_period < resolved_period else 'normal',
                'overtime_hours': Decimal('0'),
                'overtime_amount': Decimal('0'),
                'standby_hours': Decimal('0'),
                'standby_amount': Decimal('0'),
                'work_dates': [],
            })
            if entry.date.isoformat() not in bucket['work_dates']:
                bucket['work_dates'].append(entry.date.isoformat())
            bucket[f'{kind}_hours'] += entry.hours
            bucket[f'{kind}_amount'] += amount

    for entry in overtime_entries:
        cat_code, entry_warnings = classify_overtime(
            entry, inp.overtime_categories, inp.holiday_dates,
            inp.missing_timestamp_fallback_category,
        )
        warnings.extend(entry_warnings)
        cat = by_code.get(cat_code)
        multiplier = cat.multiplier if cat else Decimal('1')
        amount = entry.hours * base_hourly_rate * multiplier
        total_overtime_hours += entry.hours
        total_overtime_amount += amount
        record_entry('overtime', entry, amount, cat_code)

        # Merge into breakdown
        existing = next((b for b in overtime_breakdown if b.code == cat_code), None)
        if existing:
            existing.hours += entry.hours
            existing.amount += amount
        else:
            overtime_breakdown.append(OvertimeCategoryResult(
                code=cat_code, hours=entry.hours,
                multiplier=multiplier, amount=amount,
            ))

    trace['overtime_breakdown'] = [
        {'code': b.code, 'hours': str(b.hours), 'multiplier': str(b.multiplier),
         'amount': str(b.amount)}
        for b in overtime_breakdown
    ]

    # --- 4. Standby (dual rate: weekday vs weekend, holidays use weekday) ---
    total_standby_hours = Decimal('0')
    standby_amount = Decimal('0')
    weekday_hours = Decimal('0')
    weekend_hours = Decimal('0')
    for entry in standby_entries:
        is_holiday = entry.date in inp.holiday_dates
        is_weekend = _is_weekend(entry.date)
        # Holidays use the weekday rate (per user decision);
        # weekend standby uses the weekend rate.
        if is_weekend and not is_holiday:
            rate = inp.weekend_standby_rate
            weekend_hours += entry.hours
        else:
            rate = inp.weekday_standby_rate
            weekday_hours += entry.hours
        total_standby_hours += entry.hours
        entry_amount = entry.hours * rate
        standby_amount += entry_amount
        record_entry('standby', entry, entry_amount)
    trace['standby'] = {
        'hours': str(total_standby_hours),
        'weekday_hours': str(weekday_hours),
        'weekend_hours': str(weekend_hours),
        'weekday_rate': str(inp.weekday_standby_rate),
        'weekend_rate': str(inp.weekend_standby_rate),
        'amount': str(standby_amount),
    }
    carryover_breakdown = []
    for bucket in carryover.values():
        carryover_breakdown.append({
            **bucket,
            'overtime_hours': str(bucket['overtime_hours']),
            'overtime_amount': str(bucket['overtime_amount']),
            'standby_hours': str(bucket['standby_hours']),
            'standby_amount': str(bucket['standby_amount']),
        })
    trace['carryover_breakdown'] = carryover_breakdown
    trace['entry_details'] = entry_details

    # --- 5. Totals ---
    total_gross = inp.gross_monthly_wage + total_overtime_amount + standby_amount

    # Taxable base
    taxable_base = inp.gross_monthly_wage
    if inp.overtime_is_taxable:
        taxable_base += total_overtime_amount
    if inp.standby_is_taxable:
        taxable_base += standby_amount

    # Contribution base
    contribution_base = inp.gross_monthly_wage
    if inp.overtime_is_contribution_bearing:
        contribution_base += total_overtime_amount
    if inp.standby_is_contribution_bearing:
        contribution_base += standby_amount

    trace['total_gross'] = str(total_gross)
    trace['taxable_base'] = str(taxable_base)
    trace['contribution_base'] = str(contribution_base)

    # --- 6. Employee contributions ---
    emp_social_rate = _get_contribution(inp.contribution_rates, 'social', 'employee')
    emp_health_rate = _get_contribution(inp.contribution_rates, 'health', 'employee')

    emp_social_base = _apply_cap_floor(contribution_base, emp_social_rate)
    emp_health_base = _apply_cap_floor(contribution_base, emp_health_rate)

    employee_social = emp_social_base * emp_social_rate.rate if emp_social_rate else Decimal('0')
    employee_health = emp_health_base * emp_health_rate.rate if emp_health_rate else Decimal('0')

    trace['employee_social'] = {
        'base': str(emp_social_base), 'rate': str(emp_social_rate.rate if emp_social_rate else 0),
        'amount': str(employee_social),
    }
    trace['employee_health'] = {
        'base': str(emp_health_base), 'rate': str(emp_health_rate.rate if emp_health_rate else 0),
        'amount': str(employee_health),
    }

    # --- 7. Income tax ---
    # The Boshti reference applies progressive tax to gross taxable earnings;
    # employee contributions are deductions after tax is calculated.
    tax_base = max(taxable_base, Decimal('0'))
    income_tax = calculate_progressive_tax(tax_base, inp.tax_brackets)
    trace['income_tax'] = {
        'tax_base': str(tax_base),
        'amount': str(income_tax),
        'brackets': [
            {'lower': str(b.lower_bound), 'upper': str(b.upper_bound) if b.upper_bound else 'inf',
             'rate': str(b.rate), 'fixed': str(b.fixed_amount)}
            for b in sorted(inp.tax_brackets, key=lambda b: b.lower_bound)
        ],
    }

    # --- 8. Employer contributions ---
    emp_social_rate = _get_contribution(inp.contribution_rates, 'social', 'employer')
    emp_health_rate = _get_contribution(inp.contribution_rates, 'health', 'employer')

    employer_social_base = _apply_cap_floor(contribution_base, emp_social_rate)
    employer_health_base = _apply_cap_floor(contribution_base, emp_health_rate)

    employer_social = employer_social_base * emp_social_rate.rate if emp_social_rate else Decimal('0')
    employer_health = employer_health_base * emp_health_rate.rate if emp_health_rate else Decimal('0')

    trace['employer_social'] = {
        'base': str(employer_social_base), 'rate': str(emp_social_rate.rate if emp_social_rate else 0),
        'amount': str(employer_social),
    }
    trace['employer_health'] = {
        'base': str(employer_health_base), 'rate': str(emp_health_rate.rate if emp_health_rate else 0),
        'amount': str(employer_health),
    }

    # --- 9. Totals ---
    total_employee_deductions = employee_social + employee_health + income_tax
    net_pay = total_gross - total_employee_deductions
    total_employer_cost = total_gross + employer_social + employer_health

    # --- 10. Round ---
    def _r(v):
        return _round(v, inp.rounding_mode, inp.rounding_precision)

    result = PayrollCalculationResult(
        user_id=inp.user_id,
        user_display=inp.user_display,
        year=inp.year,
        month=inp.month,
        gross_monthly_wage=_r(inp.gross_monthly_wage),
        monthly_working_days=inp.monthly_working_days,
        monthly_standard_hours=inp.monthly_standard_hours,
        base_hourly_rate=_r(base_hourly_rate),
        overtime_hours=_r(total_overtime_hours),
        overtime_amount=_r(total_overtime_amount),
        overtime_breakdown=overtime_breakdown,
        standby_hours=_r(total_standby_hours),
        standby_amount=_r(standby_amount),
        total_gross=_r(total_gross),
        taxable_base=_r(taxable_base),
        contribution_base=_r(contribution_base),
        employee_social=_r(employee_social),
        employee_health=_r(employee_health),
        income_tax=_r(income_tax),
        total_employee_deductions=_r(total_employee_deductions),
        net_pay=_r(net_pay),
        employer_social=_r(employer_social),
        employer_health=_r(employer_health),
        total_employer_cost=_r(total_employer_cost),
        warnings=warnings,
        calculation_trace=trace,
        rule_set_code=inp.rule_set_code,
        rule_set_version=inp.rule_set_version,
        carryover_breakdown={'carried_over': carryover_breakdown},
        entry_details=entry_details,
    )

    return result

