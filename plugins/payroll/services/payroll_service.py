"""
Payroll service — bridges the pure calculator with database models.

This module handles:
- Resolving wages, rule sets, work calendars, and overtime/standby entries.
- Building ``PayrollCalculationInput`` from database data.
- Persisting ``PayrollCalculationResult`` as ``PayrollLine`` rows.
- Run-level operations: generate draft, recalculate, finalize.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.overtime.models import OvertimeLog
from apps.standby.models import StandbyLog

from ..models import (
    PayrollConfiguration,
    PayrollLine,
    PayrollRunEntry,
    PayrollRuleSet,
    PayrollRun,
    PayrollWorkCalendar,
    WageAssignment,
)
from .calculator import (
    ContributionRateInput,
    OvertimeCategoryInput,
    OvertimeEntryInput,
    PayrollCalculationInput,
    StandbyEntryInput,
    TaxBracketInput,
    calculate_payroll,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Rule set resolution
# ---------------------------------------------------------------------------

def _build_tax_bracket_inputs(rule_set: PayrollRuleSet) -> list[TaxBracketInput]:
    brackets = rule_set.tax_brackets.all().order_by('order', 'lower_bound')
    return [
        TaxBracketInput(
            lower_bound=b.lower_bound,
            upper_bound=b.upper_bound,
            rate=b.rate,
            fixed_amount=b.fixed_amount,
        )
        for b in brackets
    ]


def _build_contribution_rate_inputs(rule_set: PayrollRuleSet) -> list[ContributionRateInput]:
    rates = rule_set.contribution_rates.all()
    return [
        ContributionRateInput(
            contribution_type=r.contribution_type,
            side=r.side,
            rate=r.rate,
            cap=r.cap,
            floor=r.floor,
        )
        for r in rates
    ]


def _build_overtime_category_inputs(rule_set: PayrollRuleSet) -> list[OvertimeCategoryInput]:
    cats = rule_set.overtime_categories.all().order_by('order', 'code')
    return [
        OvertimeCategoryInput(
            code=c.code,
            multiplier=c.multiplier,
            night_start_hour=c.night_start_hour,
            night_end_hour=c.night_end_hour,
            applies_weekend=c.applies_weekend,
            applies_holiday=c.applies_holiday,
        )
        for c in cats
    ]


# ---------------------------------------------------------------------------
# Work calendar resolution
# ---------------------------------------------------------------------------

def _get_month_range(year: int, month: int) -> tuple[date, date]:
    start = date(year, month, 1)
    if month == 12:
        end = date(year, 12, 31)
    else:
        end = date(year, month + 1, 1) - timedelta(days=1)
    return start, end


def _resolve_work_calendar(config: PayrollConfiguration, year: int) -> Optional[PayrollWorkCalendar]:
    return PayrollWorkCalendar.objects.filter(
        country=config.country, year=year, is_active=True,
    ).first()


def _get_month_workdays(config: PayrollConfiguration, year: int, month: int) -> dict:
    """Return working-days info for the month.

    Returns dict with:
    - working_days: int
    - standard_hours: Decimal
    - holiday_dates: set[date]
    """
    start, end = _get_month_range(year, month)
    calendar = _resolve_work_calendar(config, year)

    holiday_dates: set[date] = set()
    working_days = 0
    standard_hours = Decimal('0')

    if calendar:
        workdays = calendar.workdays.filter(date__gte=start, date__lte=end)
        for wd in workdays:
            if wd.is_holiday:
                holiday_dates.add(wd.date)
            if wd.is_working_day:
                working_days += 1
                standard_hours += wd.standard_hours
    else:
        # Fallback: count weekdays (Mon–Fri) in the month
        current = start
        while current <= end:
            if current.weekday() < 5:
                working_days += 1
                standard_hours += config.default_workday_hours
            current += timedelta(days=1)

    # Compute monthly standard hours based on strategy
    if config.monthly_hours_strategy == 'fixed_174':
        standard_hours = Decimal('174')
    elif config.monthly_hours_strategy == 'calendar_days':
        standard_hours = Decimal(end.day * 8)
    # else: workdays_x8 — already computed above

    return {
        'working_days': working_days,
        'standard_hours': standard_hours,
        'holiday_dates': holiday_dates,
    }


# ---------------------------------------------------------------------------
# Overtime and standby resolution
# ---------------------------------------------------------------------------

def _finalized_periods_before(period: date) -> set[date]:
    """Return requested periods whose PayrollRun is already finalized."""
    return {
        date(run.year, run.month, 1)
        for run in PayrollRun.objects.filter(
            status='finalized',
            year__lte=period.year,
        ).only('year', 'month')
        if date(run.year, run.month, 1) < period
    }


def _source_queryset(model, source_kind: str, user, period: date, only_approved: bool):
    """Select normal entries and unresolved entries from finalized targets."""
    finalized_periods = _finalized_periods_before(period)
    filters = Q(requested_processing_period=period)
    if finalized_periods:
        filters |= Q(requested_processing_period__in=finalized_periods)
    qs = model.objects.filter(user=user).filter(filters)
    if only_approved:
        qs = qs.filter(status='approved')
    else:
        qs = qs.exclude(status='rejected')

    finalized_ids = PayrollRunEntry.objects.filter(
        source_kind=source_kind,
        status='finalized',
    ).values('source_id')
    return qs.exclude(id__in=finalized_ids).order_by('date', 'id')


def _get_overtime_entries(user, period: date, only_approved: bool) -> list[OvertimeEntryInput]:
    qs = _source_queryset(OvertimeLog, 'overtime', user, period, only_approved)
    return [
        OvertimeEntryInput(
            date=ot.date,
            hours=ot.hours,
            start_time=ot.start_time,
            end_time=ot.end_time,
            source_id=ot.id,
            requested_period=ot.requested_processing_period or ot.date.replace(day=1),
            source_status=ot.status,
        )
        for ot in qs
    ]


def _get_standby_entries(user, period: date, only_approved: bool) -> list[StandbyEntryInput]:
    qs = _source_queryset(StandbyLog, 'standby', user, period, only_approved)
    return [
        StandbyEntryInput(
            date=sb.date,
            hours=sb.hours,
            source_id=sb.id,
            requested_period=sb.requested_processing_period or sb.date.replace(day=1),
            source_status=sb.status,
        )
        for sb in qs
    ]


def _get_source_holidays(config: PayrollConfiguration, entries) -> set[date]:
    """Load holidays for every work-date month represented by source entries."""
    dates = {entry.date for entry in entries}
    holidays: set[date] = set()
    for year in {item.year for item in dates}:
        calendar = _resolve_work_calendar(config, year)
        if not calendar:
            continue
        workdays = calendar.workdays.filter(date__in=dates, is_holiday=True)
        holidays.update(workday.date for workday in workdays)
    return holidays


# ---------------------------------------------------------------------------
# Configuration snapshot
# ---------------------------------------------------------------------------

def _snapshot_config(config: PayrollConfiguration) -> dict:
    return {
        'currency': config.currency,
        'country': config.country,
        'rounding_mode': config.rounding_mode,
        'rounding_precision': config.rounding_precision,
        'weekday_standby_hourly_rate': str(config.weekday_standby_hourly_rate),
        'weekend_standby_hourly_rate': str(config.weekend_standby_hourly_rate),
        'monthly_hours_strategy': config.monthly_hours_strategy,
        'default_workday_hours': str(config.default_workday_hours),
        'only_approved_entries': config.only_approved_entries,
        'require_tl_closed_before_finalize': config.require_tl_closed_before_finalize,
        'overtime_is_taxable': config.overtime_is_taxable,
        'standby_is_taxable': config.standby_is_taxable,
        'overtime_is_contribution_bearing': config.overtime_is_contribution_bearing,
        'standby_is_contribution_bearing': config.standby_is_contribution_bearing,
        'missing_timestamp_fallback_category': config.missing_timestamp_fallback_category,
        'rules_source_label': config.rules_source_label,
        'rules_validation_status': config.rules_validation_status,
    }


# ---------------------------------------------------------------------------
# Build calculation input
# ---------------------------------------------------------------------------

def build_calculation_input(
    user, year: int, month: int,
    config: Optional[PayrollConfiguration] = None,
    rule_set: Optional[PayrollRuleSet] = None,
    wage: Optional[WageAssignment] = None,
) -> PayrollCalculationInput:
    """Build a ``PayrollCalculationInput`` from database data for one user/month."""
    if config is None:
        config = PayrollConfiguration.get_singleton()

    start, end = _get_month_range(year, month)

    # Resolve rule set
    if rule_set is None:
        rule_set = PayrollRuleSet.resolve_for_date(start, config.default_tax_profile)
    if rule_set is None:
        raise ValidationError(
            f'No active payroll rule set effective on {start}. '
            f'Create one in Payroll Settings before generating runs.'
        )

    # Resolve wage (use provided instance to avoid duplicate queries)
    if wage is None:
        wage = WageAssignment.resolve_for_month(user, year, month)

    # Work calendar
    cal_info = _get_month_workdays(config, year, month)

    # Overtime and standby are selected by requested/resolved processing period,
    # not by work-date month. Work dates remain available to classify each entry.
    processing_period = date(year, month, 1)
    overtime_entries = _get_overtime_entries(user, processing_period, config.only_approved_entries)
    standby_entries = _get_standby_entries(user, processing_period, config.only_approved_entries)
    source_entries = [*overtime_entries, *standby_entries]
    holiday_dates = _get_source_holidays(config, source_entries)

    # Rule set inputs
    tax_brackets = _build_tax_bracket_inputs(rule_set)
    contribution_rates = _build_contribution_rate_inputs(rule_set)
    overtime_categories = _build_overtime_category_inputs(rule_set)

    return PayrollCalculationInput(
        user_id=user.id,
        user_display=user.get_full_name() or user.username,
        year=year,
        month=month,
        gross_monthly_wage=wage.gross_monthly_wage,
        monthly_working_days=cal_info['working_days'],
        monthly_standard_hours=cal_info['standard_hours'],
        overtime_entries=overtime_entries,
        standby_entries=standby_entries,
        weekday_standby_rate=config.weekday_standby_hourly_rate,
        weekend_standby_rate=config.weekend_standby_hourly_rate,
        tax_brackets=tax_brackets,
        contribution_rates=contribution_rates,
        overtime_categories=overtime_categories,
        rounding_mode=config.rounding_mode,
        rounding_precision=config.rounding_precision,
        missing_timestamp_fallback_category=config.missing_timestamp_fallback_category,
        holiday_dates=holiday_dates,
        overtime_is_taxable=config.overtime_is_taxable,
        standby_is_taxable=config.standby_is_taxable,
        overtime_is_contribution_bearing=config.overtime_is_contribution_bearing,
        standby_is_contribution_bearing=config.standby_is_contribution_bearing,
        rule_set_code=rule_set.code,
        rule_set_version=rule_set.version,
    )


# ---------------------------------------------------------------------------
# Run operations
# ---------------------------------------------------------------------------

def _create_run_entries(run: PayrollRun, line: PayrollLine, result) -> None:
    """Persist draft source-entry inclusion snapshots for one line."""
    resolved_period = date(run.year, run.month, 1)
    entries = []
    for detail in result.entry_details:
        requested_period = date.fromisoformat(detail['requested_period'])
        source_kind = detail['source_kind']
        amount = Decimal(detail['amount'])
        entries.append(PayrollRunEntry(
            run=run,
            line=line,
            source_kind=source_kind,
            source_id=detail['source_id'],
            user_id=line.user_id,
            work_date=date.fromisoformat(detail['work_date']),
            requested_period=requested_period,
            resolved_period=resolved_period,
            hours=Decimal(detail['hours']),
            overtime_amount=amount if source_kind == 'overtime' else Decimal('0'),
            standby_amount=amount if source_kind == 'standby' else Decimal('0'),
            source_status=detail.get('source_status', 'approved'),
            resolution_reason=(
                'target_finalized' if requested_period < resolved_period else 'normal'
            ),
            status='draft',
        ))
    PayrollRunEntry.objects.bulk_create(entries)


def generate_draft_run(run: PayrollRun, users) -> list[PayrollLine]:
    """Generate (or regenerate) draft payroll lines for all users.

    Deletes existing draft lines for the run, then recalculates.
    Raises unless the run is still a draft.
    """
    config = PayrollConfiguration.get_singleton()

    with transaction.atomic():
        locked_run = PayrollRun.objects.select_for_update().select_related('rule_set').get(pk=run.pk)
        if locked_run.status != 'draft':
            raise ValidationError(
                f'Only draft runs can be regenerated. Current status: {locked_run.status}.'
            )
        rule_set = locked_run.rule_set

        # Clear existing draft source snapshots and lines together.
        locked_run.source_entries.filter(status='draft').delete()
        locked_run.lines.all().delete()

        lines: list[PayrollLine] = []
        for user in users:
            # Resolve wage once — passed to build_calculation_input to
            # avoid a duplicate query, and reused for the FK reference.
            wage = WageAssignment.resolve_for_month(user, locked_run.year, locked_run.month)
            inp = build_calculation_input(
                user, locked_run.year, locked_run.month, config, rule_set, wage=wage,
            )
            result = calculate_payroll(inp)

            line = PayrollLine.objects.create(
                user=user,
                run=locked_run,
                wage_assignment=wage,
                gross_monthly_wage=result.gross_monthly_wage,
                monthly_working_days=result.monthly_working_days,
                monthly_standard_hours=result.monthly_standard_hours,
                overtime_hours=result.overtime_hours,
                overtime_amount=result.overtime_amount,
                standby_hours=result.standby_hours,
                standby_amount=result.standby_amount,
                total_gross=result.total_gross,
                taxable_base=result.taxable_base,
                contribution_base=result.contribution_base,
                employee_social=result.employee_social,
                employee_health=result.employee_health,
                income_tax=result.income_tax,
                total_employee_deductions=result.total_employee_deductions,
                net_pay=result.net_pay,
                employer_social=result.employer_social,
                employer_health=result.employer_health,
                total_employer_cost=result.total_employer_cost,
                overtime_breakdown={
                    'categories': [
                        {'code': b.code, 'hours': str(b.hours),
                         'multiplier': str(b.multiplier), 'amount': str(b.amount)}
                        for b in result.overtime_breakdown
                    ],
                },
                carryover_breakdown=result.carryover_breakdown,
                calculation_trace=result.calculation_trace,
                warnings=result.warnings,
                rule_set_version=result.rule_set_version,
            )
            _create_run_entries(locked_run, line, result)
            lines.append(line)

        # Update run totals
        _update_run_totals(locked_run)
        locked_run.configuration_snapshot = _snapshot_config(config)
        locked_run.save()
        run.totals = locked_run.totals
        run.configuration_snapshot = locked_run.configuration_snapshot

    return lines


def _update_run_totals(run: PayrollRun):
    """Aggregate line totals into the run's totals JSON field."""
    from django.db.models import Sum
    agg = run.lines.aggregate(
        total_gross=Sum('total_gross'),
        total_deductions=Sum('total_employee_deductions'),
        total_net=Sum('net_pay'),
        total_employer_cost=Sum('total_employer_cost'),
        total_overtime=Sum('overtime_amount'),
        total_standby=Sum('standby_amount'),
    )
    run.totals = {
        'total_gross': str(agg['total_gross'] or Decimal('0')),
        'total_deductions': str(agg['total_deductions'] or Decimal('0')),
        'total_net': str(agg['total_net'] or Decimal('0')),
        'total_employer_cost': str(agg['total_employer_cost'] or Decimal('0')),
        'total_overtime': str(agg['total_overtime'] or Decimal('0')),
        'total_standby': str(agg['total_standby'] or Decimal('0')),
        'line_count': run.lines.count(),
    }


def get_period_closure_status(run: PayrollRun) -> dict:
    """Return TL approval-period closure readiness for every payroll line user.

    Base-wage-only employees still need their approval period closed before a
    run can be finalized; they may submit late OT/standby after the cutoff.
    """
    from apps.users.models import ApprovalPeriodCloseMember

    period = date(run.year, run.month, 1)
    entries = list(run.source_entries.select_related('user').all())
    users = {line.user_id: line.user for line in run.lines.select_related('user').all()}
    closed_user_ids = set(
        ApprovalPeriodCloseMember.objects.filter(
            user_id__in=users,
            close__boundary__period=period,
        ).values_list('user_id', flat=True)
    )
    unclosed_users = [
        {'id': user.id, 'username': user.username}
        for user_id, user in sorted(users.items(), key=lambda item: item[1].username)
        if user_id not in closed_user_ids
    ]

    entries_without_source_closure = []
    for entry in entries:
        source_model = OvertimeLog if entry.source_kind == 'overtime' else StandbyLog
        source = source_model.objects.select_related(
            'approval_period_close__boundary',
        ).filter(pk=entry.source_id).first()
        close_period = getattr(
            getattr(source, 'approval_period_close', None), 'boundary', None,
        )
        if not source or not source.approval_period_close_id or not close_period or close_period.period != period:
            entries_without_source_closure.append({
                'source_kind': entry.source_kind,
                'source_id': entry.source_id,
                'user_id': entry.user_id,
            })

    return {
        'all_closed': not unclosed_users,
        'period': period,
        'total_users': len(users),
        'closed_users': len(users) - len(unclosed_users),
        'unclosed_users': unclosed_users,
        'entries_without_source_closure': entries_without_source_closure,
    }


def _finalize_run_entries(locked_run: PayrollRun) -> None:
    """Validate and freeze source-entry inclusion snapshots."""
    from apps.overtime.models import OvertimeLog
    from apps.standby.models import StandbyLog

    entries = list(
        locked_run.source_entries.select_for_update().filter(status='draft')
    )
    if not entries:
        return

    finalized_at = timezone.now()
    for entry in entries:
        source_model = OvertimeLog if entry.source_kind == 'overtime' else StandbyLog
        source = source_model.objects.select_for_update().get(pk=entry.source_id)
        if source.status != 'approved':
            raise ValidationError(
                f'{entry.source_kind.title()} entry {entry.source_id} is not approved.'
            )
        source.resolved_settlement_period = entry.resolved_period
        source.save(update_fields=['resolved_settlement_period', 'updated_at'])
        entry.status = 'finalized'
        entry.finalized_at = finalized_at
        entry.source_status = source.status
        entry.save(update_fields=['status', 'finalized_at', 'source_status'])


def finalize_run(run: PayrollRun, user) -> PayrollRun:
    """Finalize a draft payroll run. Makes all lines and source snapshots immutable."""
    if run.status != 'draft':
        raise ValidationError(f'Only draft runs can be finalized. Current status: {run.status}.')
    if run.lines.count() == 0:
        raise ValidationError('Cannot finalize a run with no payroll lines.')

    with transaction.atomic():
        # Lock the run row to prevent concurrent finalization
        locked_run = PayrollRun.objects.select_for_update().get(pk=run.pk)
        if locked_run.status != 'draft':
            raise ValidationError('Run was finalized by another process.')

        config = PayrollConfiguration.get_singleton()
        if config.require_tl_closed_before_finalize:
            closure_status = get_period_closure_status(locked_run)
            if not closure_status['all_closed']:
                usernames = ', '.join(
                    user['username'] for user in closure_status['unclosed_users']
                )
                raise ValidationError(
                    f"Cannot finalize payroll run {locked_run.period_label}: "
                    f'TL approval-period closure is missing for users: {usernames}.'
                )

        _update_run_totals(locked_run)
        _finalize_run_entries(locked_run)
        locked_run.status = 'finalized'
        locked_run.finalized_by = user
        locked_run.finalized_at = timezone.now()
        locked_run.save()
        return locked_run


def cancel_run(run: PayrollRun, user) -> PayrollRun:
    """Cancel a draft payroll run."""
    with transaction.atomic():
        locked_run = PayrollRun.objects.select_for_update().get(pk=run.pk)
        if locked_run.status != 'draft':
            raise ValidationError(
                f'Only draft runs can be cancelled. Current status: {locked_run.status}.'
            )
        locked_run.status = 'cancelled'
        locked_run.save(update_fields=['status', 'updated_at'])
        return locked_run


def regenerate_single_line(run: PayrollRun, user) -> PayrollLine:
    """Regenerate a single user's payroll line within a draft run.

    Deletes the existing line for this user (if any), recalculates,
    and creates a new line. Updates run totals.
    """
    config = PayrollConfiguration.get_singleton()

    with transaction.atomic():
        locked_run = PayrollRun.objects.select_for_update().select_related('rule_set').get(pk=run.pk)
        if locked_run.status != 'draft':
            raise ValidationError(
                f'Only draft runs can be regenerated. Current status: {locked_run.status}.'
            )
        rule_set = locked_run.rule_set

        # Delete existing draft source snapshots and line for this user.
        locked_run.source_entries.filter(user=user, status='draft').delete()
        locked_run.lines.filter(user=user).delete()

        # Resolve wage once — passed to build_calculation_input to avoid
        # a duplicate query, and reused for the FK reference.
        wage = WageAssignment.resolve_for_month(user, locked_run.year, locked_run.month)
        inp = build_calculation_input(
            user, locked_run.year, locked_run.month, config, rule_set, wage=wage,
        )
        result = calculate_payroll(inp)

        line = PayrollLine.objects.create(
            user=user,
            run=locked_run,
            wage_assignment=wage,
            gross_monthly_wage=result.gross_monthly_wage,
            monthly_working_days=result.monthly_working_days,
            monthly_standard_hours=result.monthly_standard_hours,
            overtime_hours=result.overtime_hours,
            overtime_amount=result.overtime_amount,
            standby_hours=result.standby_hours,
            standby_amount=result.standby_amount,
            total_gross=result.total_gross,
            taxable_base=result.taxable_base,
            contribution_base=result.contribution_base,
            employee_social=result.employee_social,
            employee_health=result.employee_health,
            income_tax=result.income_tax,
            total_employee_deductions=result.total_employee_deductions,
            net_pay=result.net_pay,
            employer_social=result.employer_social,
            employer_health=result.employer_health,
            total_employer_cost=result.total_employer_cost,
            overtime_breakdown={
                'categories': [
                    {'code': b.code, 'hours': str(b.hours),
                     'multiplier': str(b.multiplier), 'amount': str(b.amount)}
                    for b in result.overtime_breakdown
                ],
            },
            carryover_breakdown=result.carryover_breakdown,
            calculation_trace=result.calculation_trace,
            warnings=result.warnings,
            rule_set_version=result.rule_set_version,
        )
        _create_run_entries(locked_run, line, result)

        # Update run totals
        _update_run_totals(locked_run)
        locked_run.save()
        run.totals = locked_run.totals

    return line
