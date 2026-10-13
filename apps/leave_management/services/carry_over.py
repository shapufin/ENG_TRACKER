"""Year-end vacation carry-over (plan v2).

Rules implemented here:
- At rollover, a closed year's unused vacation becomes a carry row for that
  year. Pending days count as reserved, so they are never carried twice.
- A carry row expires on the settings date (default 31 Mar of the next year),
  and carry days are only usable for weekdays up to and including that date.
- Years are closed once the rollover has run. Closed-year days that are
  released later (rejected, cancelled, or cancelled after approval) flow back
  into that year's carry row, so the carry always equals the unused balance.
"""

import calendar
from datetime import date
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.leave_management.models.core import (
    GlobalSettings,
    LeaveBalance,
    count_leave_days,
)

ZERO = Decimal('0')


def carry_over_expiry_for(closed_year: int, month: int, day: int) -> date:
    """Expiry date of carry from ``closed_year``: ``day`` of ``month`` in the next year.

    A day that does not exist in that month (e.g. 31 Feb, or 29 Feb in a
    non-leap year) clamps to the last day of the month.
    """
    year = closed_year + 1
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(day, last_day))


def _settings():
    obj, _ = GlobalSettings.objects.get_or_create(pk=1)
    return obj


def is_closed_year(year: int, settings_obj=None) -> bool:
    """A year is closed once the rollover for the following year has been applied."""
    settings_obj = settings_obj or _settings()
    applied = settings_obj.carry_over_applied_year
    return applied is not None and year <= applied - 1


def _entitled_at_year_end(balance: LeaveBalance, year: int) -> Decimal:
    if balance.accrual_start_date:
        return Decimal(balance.get_monthly_accrued_days(date(year, 12, 31)))
    return Decimal(balance.total_days)


def ensure_carry_over_for_user(user_id: int, closed_year: int, settings_obj=None):
    """Create the carry row for one user and closed year. Idempotent."""
    settings_obj = settings_obj or _settings()
    if not settings_obj.carry_over_enabled:
        return None
    closed = LeaveBalance.objects.filter(
        user_id=user_id, leave_type='vacation', is_carry_over=False, year=closed_year,
    ).first()
    if closed is None:
        return None
    existing = LeaveBalance.objects.filter(
        user_id=user_id, leave_type='vacation', is_carry_over=True, year=closed_year,
    ).first()
    if existing is not None:
        return existing
    leftover = _entitled_at_year_end(closed, closed_year) - Decimal(closed.used_days) - Decimal(closed.pending_days)
    if leftover <= ZERO:
        return None
    return LeaveBalance.objects.create(
        user_id=user_id,
        leave_type='vacation',
        year=closed_year,
        is_carry_over=True,
        total_days=leftover,
        expires_at=carry_over_expiry_for(
            closed_year, settings_obj.carry_over_expiry_month, settings_obj.carry_over_expiry_day,
        ),
    )


def apply_year_end_carry_over(today=None) -> dict:
    """Roll over the year before ``today.year``, once per year. Safe to call often.

    Locks the settings row so two first reads of a new year cannot both roll
    over. The marker is set in the same transaction, so a crash leaves the year
    un-applied and the next call retries it.
    """
    today = today or timezone.localdate()
    counts = {'created': 0, 'skipped': 0}
    with transaction.atomic():
        _settings()
        settings_obj = GlobalSettings.objects.select_for_update().get(pk=1)
        applied = settings_obj.carry_over_applied_year
        if applied is not None and applied >= today.year:
            return counts
        closed_year = today.year - 1
        if settings_obj.carry_over_enabled:
            user_ids = set(
                LeaveBalance.objects.filter(
                    leave_type='vacation', is_carry_over=False, year=closed_year,
                ).values_list('user_id', flat=True)
            )
            for user_id in sorted(user_ids):
                if ensure_carry_over_for_user(user_id, closed_year, settings_obj) is None:
                    counts['skipped'] += 1
                else:
                    counts['created'] += 1
        settings_obj.carry_over_applied_year = today.year
        settings_obj.save(update_fields=['carry_over_applied_year'])
    return counts


def ensure_year_end_rollover():
    """Called before any leave read or write so the first read of a year rolls it over."""
    apply_year_end_carry_over(timezone.localdate())


def restore_closed_year_days(user_id: int, year: int, days: Decimal, settings_obj=None):
    """Return days released from a closed year to that year's carry row."""
    if days <= ZERO:
        return
    settings_obj = settings_obj or _settings()
    carry = LeaveBalance.objects.select_for_update().filter(
        user_id=user_id, leave_type='vacation', is_carry_over=True, year=year,
    ).first()
    if carry is None:
        if not settings_obj.carry_over_enabled:
            return
        LeaveBalance.objects.create(
            user_id=user_id,
            leave_type='vacation',
            year=year,
            is_carry_over=True,
            total_days=days,
            expires_at=carry_over_expiry_for(
                year, settings_obj.carry_over_expiry_month, settings_obj.carry_over_expiry_day,
            ),
        )
        return
    carry.total_days = Decimal(carry.total_days) + days
    carry.save(update_fields=['total_days'])


def find_carry_balance(user_id: int, start_date):
    """The carry row a request starting on ``start_date`` may draw from, if any."""
    return LeaveBalance.objects.filter(
        user_id=user_id, leave_type='vacation', is_carry_over=True,
        year=start_date.year - 1, expires_at__gte=start_date,
    ).first()


def plan_vacation_split(user_id: int, start_date, end_date) -> dict:
    """Split a vacation request into carry-over days and current-year days.

    Carry is used first, but only for weekdays up to and including its expiry,
    and never more than is still available. Everything else comes from the
    current year. This is the single rule used by validation, deduction and the
    preview endpoint.
    """
    counted = count_leave_days(start_date, end_date)
    carry = find_carry_balance(user_id, start_date)
    carry_days = ZERO
    if carry is not None and counted > 0:
        eligible_to = min(end_date, carry.expires_at)
        eligible = count_leave_days(start_date, eligible_to)
        carry_days = min(Decimal(carry.get_effective_available_days()), Decimal(eligible))
    return {
        'counted': counted,
        'carry_balance': carry if carry_days > ZERO else None,
        'carry_available': Decimal(carry.get_effective_available_days()) if carry else ZERO,
        'carry_expires_at': carry.expires_at if carry else None,
        'carry_days': carry_days,
        'current_days': Decimal(counted) - carry_days,
    }


# (old status, new status) -> which counters move on each part of a request.
# 'reserve' = pending, 'use' = used. A missing pair moves nothing.
_TRANSITIONS = {
    ('pending', 'approved'): ('reserve', 'use'),
    ('rejected', 'approved'): (None, 'use'),
    ('pending', 'rejected'): ('reserve', None),
    ('pending', 'cancelled'): ('reserve', None),
    ('approved', 'rejected'): ('use', None),
    ('approved', 'cancelled'): ('use', None),
}


def _move_part(row: LeaveBalance, days: Decimal, old_status: str, new_status: str, settings_obj):
    removed, added = _TRANSITIONS.get((old_status, new_status), (None, None))
    if added == 'use' and removed is None and row.is_carry_over is False and is_closed_year(row.year, settings_obj):
        # Those days left the carry when the request was rejected; charging them
        # again here would count them twice.
        raise ValueError(f'Closed year {row.year}: a rejected request cannot be re-approved.')
    if removed == 'reserve':
        row.pending_days = max(ZERO, Decimal(row.pending_days) - days)
    elif removed == 'use':
        row.used_days = max(ZERO, Decimal(row.used_days) - days)
    if added == 'reserve':
        row.pending_days = Decimal(row.pending_days) + days
    elif added == 'use':
        row.used_days = Decimal(row.used_days) + days
    row.save(update_fields=['pending_days', 'used_days'])
    released = removed is not None and added is None
    if released and row.is_carry_over is False and is_closed_year(row.year, settings_obj):
        restore_closed_year_days(row.user_id, row.year, days, settings_obj)


def move_request_days(request_obj, old_status: str, new_status: str):
    """Move a request's counted days on every balance it touches.

    Both parts (carry-over and current year) move together, so approve, reject,
    cancel and edit always move the amount that was reserved at creation.
    Rows are locked in pk order to avoid deadlocks between two requests.
    """
    if (old_status, new_status) not in _TRANSITIONS:
        return
    settings_obj = _settings()
    carry_days = Decimal(request_obj.carry_days or 0)
    counted = Decimal(request_obj.days_counted or 0)
    parts = []
    if request_obj.carry_balance_id and carry_days > ZERO:
        parts.append((request_obj.carry_balance_id, carry_days))
    if request_obj.balance_id and counted - carry_days > ZERO:
        parts.append((request_obj.balance_id, counted - carry_days))
    for balance_id, days in sorted(parts):
        row = LeaveBalance.objects.select_for_update().get(pk=balance_id)
        _move_part(row, days, old_status, new_status, settings_obj)
