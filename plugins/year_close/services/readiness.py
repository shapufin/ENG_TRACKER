"""Whether a year may close: blockers stop it, warnings are recorded (plan Y3).

Every check is a query, and every cross-plugin check is guarded: a disabled or
missing Payroll/tl_scorecard plugin must never make the close fail.
"""
from __future__ import annotations

from datetime import date

from django.db.models import Q

from apps.leave_management.models import LeaveRequest
from apps.overtime.models import OvertimeLog
from apps.standby.models import StandbyLog
from core.utils.timezone_local import business_today


def _payroll_models():
    """(PayrollRun, PayrollRunEntry) or ``None`` when the plugin is unavailable."""
    try:
        from plugins.payroll.models import PayrollRun, PayrollRunEntry
    except Exception:  # noqa: BLE001 - disabled or uninstalled plugin
        return None
    return PayrollRun, PayrollRunEntry


def _tl_scorecard_models():
    try:
        from plugins.tl_scorecard.models import EPRCycle
    except Exception:  # noqa: BLE001
        return None
    return EPRCycle


def _year_bounds(year: int) -> tuple[date, date]:
    return date(year, 1, 1), date(year, 12, 31)


def check_year_readiness(year: int) -> dict:
    """Return ``{"blockers": [...], "warnings": [...]}`` for closing ``year``."""
    blockers: list[str] = []
    warnings: list[str] = []
    first_day, last_day = _year_bounds(year)

    today = business_today()
    if today < date(year + 1, 2, 1):
        blockers.append(
            f'{year} can only close from 1 February {year + 1}; today is {today.isoformat()}.'
        )

    payroll = _payroll_models()
    if payroll is not None:
        PayrollRun, PayrollRunEntry = payroll
        draft_runs = PayrollRun.objects.filter(year=year, status='draft').count()
        if draft_runs:
            blockers.append(
                f'{draft_runs} draft payroll run(s) of {year} must be finalized or cancelled.'
            )

        for model, kind, label in (
            (OvertimeLog, 'overtime', 'overtime'),
            (StandbyLog, 'standby', 'standby'),
        ):
            unreferenced = model.objects.filter(
                date__gte=first_day, date__lte=last_day, status='approved', is_deleted=False,
            ).exclude(
                id__in=PayrollRunEntry.objects.filter(
                    source_kind=kind, run__status='finalized',
                ).values('source_id')
            ).count()
            if unreferenced:
                blockers.append(
                    f'{unreferenced} approved {label} entr(y/ies) of {year} are not in any '
                    f'finalized payroll run.'
                )

    for model, label in ((OvertimeLog, 'overtime'), (StandbyLog, 'standby')):
        pending = model.objects.filter(
            date__gte=first_day, date__lte=last_day, status='pending', is_deleted=False,
        ).count()
        if pending:
            blockers.append(f'{pending} {label} entr(y/ies) of {year} are still pending.')

    pending_leave = LeaveRequest.objects.filter(
        status='pending', is_deleted=False,
        start_date__lte=last_day, end_date__gte=first_day,
    ).count()
    if pending_leave:
        blockers.append(f'{pending_leave} leave request(s) overlapping {year} are still pending.')

    warnings.extend(_warning_list(year, first_day, last_day))
    return {'blockers': blockers, 'warnings': warnings}


def _warning_list(year: int, first_day: date, last_day: date) -> list[str]:
    warnings: list[str] = []

    scorecard = _tl_scorecard_models()
    if scorecard is not None:
        EPRCycle = scorecard
        unfinished = EPRCycle.objects.filter(
            year=year, is_deleted=False, final_review_completed_at__isnull=True,
        ).count()
        if unfinished:
            warnings.append(f'{unfinished} EPR cycle(s) of {year} have no final review.')

    settled_later = 0
    for model in (OvertimeLog, StandbyLog):
        settled_later += model.objects.filter(
            date__gte=first_day, date__lte=last_day, status='approved', is_deleted=False,
            resolved_settlement_period__year__gt=year,
        ).count()
    if settled_later:
        warnings.append(
            f'{settled_later} approved entr(y/ies) of {year} settle in {year + 1}; the '
            f'snapshot shows them as of close time.'
        )

    inactive = set()
    for model in (OvertimeLog, StandbyLog):
        inactive |= set(
            model.objects.filter(
                date__gte=first_day, date__lte=last_day, is_deleted=False, user__is_active=False,
            ).values_list('user_id', flat=True)
        )
    if inactive:
        warnings.append(f'{len(inactive)} deactivated user(s) have rows in {year}.')

    return warnings


def apply_year_end_rollover() -> None:
    """Run the leave carry-over for the year being closed, before the snapshot.

    The close step calls it first so the snapshot records post-rollover balances
    instead of a state that changes the moment the year ends.
    """
    from apps.leave_management.services.carry_over import ensure_year_end_rollover

    ensure_year_end_rollover()


def rollover_applied_for(year: int) -> bool:
    """Whether the leave rollover into ``year`` has been applied."""
    from apps.leave_management.models import GlobalSettings

    settings_row, _ = GlobalSettings.objects.get_or_create(pk=1)
    applied = settings_row.carry_over_applied_year
    return bool(applied and applied >= year)


def is_year_eligible(year: int, today: date | None = None) -> bool:
    """A year closes from 1 February of the following year."""
    today = today or business_today()
    return today >= date(year + 1, 2, 1)


def pending_counts(year: int) -> dict:
    """Row counts the manifest records for the set (one query per model)."""
    first_day, last_day = _year_bounds(year)
    window = Q(date__gte=first_day, date__lte=last_day, is_deleted=False)
    return {
        'overtime': OvertimeLog.objects.filter(window).count(),
        'standby': StandbyLog.objects.filter(window).count(),
        'leave': LeaveRequest.objects.filter(
            start_date__lte=last_day, end_date__gte=first_day, is_deleted=False,
        ).count(),
    }
