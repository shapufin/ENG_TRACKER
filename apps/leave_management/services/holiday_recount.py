"""Recount future leave after a public holiday is added, moved or removed (audit M4).

``days_counted`` is frozen when a request is made, so a holiday that arrives later
would leave the employee charged for a day off. This is the one writer that fixes
it: it releases the request's reservation, recounts, and reserves again through the
same carry-over split used at creation, so balances always match the request.
"""
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from django.db import transaction

from apps.leave_management.models.core import LeaveRequest, count_request_days
from apps.leave_management.services.carry_over import (
    is_closed_year,
    move_request_days,
    reserve_vacation_days,
)
from core.utils.timezone_local import business_today

OPEN_STATUSES = ('pending', 'approved')


@dataclass(frozen=True)
class RecountChange:
    request_id: int
    user_id: int
    status: str
    start_date: date
    end_date: date
    old_days: Decimal
    new_days: Decimal


def _candidates(date_from, date_to, today):
    qs = LeaveRequest.objects.filter(
        request_type='vacation', status__in=OPEN_STATUSES, is_deleted=False,
        end_date__gte=today,
    )
    if date_from:
        qs = qs.filter(end_date__gte=date_from)
    if date_to:
        qs = qs.filter(start_date__lte=date_to)
    return qs.order_by('pk')


def _count(leave) -> Decimal:
    return Decimal(count_request_days(
        'vacation', leave.start_date, leave.end_date, is_half_day=leave.is_half_day,
    ))


def _apply(request_id):
    """Release, recount, reserve again. Returns the stored count, or ``None`` if nothing changed.

    The count is taken from the LOCKED row: an edit between the scan and the lock would
    otherwise store a count of dates the request no longer has (audit 2026-11-17 M10).
    """
    with transaction.atomic():
        leave = LeaveRequest.objects.select_for_update().get(pk=request_id)
        if leave.status not in OPEN_STATUSES:
            return None
        new_days = _count(leave)
        if leave.days_counted is not None and Decimal(leave.days_counted) == new_days:
            return None
        status = leave.status
        has_balance = bool(leave.balance_id or leave.carry_balance_id)
        if has_balance:
            move_request_days(leave, status, 'cancelled')
        leave.days_counted = new_days
        leave.balance = None
        leave.carry_balance = None
        leave.carry_days = Decimal('0')
        leave.save(update_fields=['days_counted', 'balance', 'carry_balance', 'carry_days'])
        if has_balance and new_days > 0:
            reserve_vacation_days(leave)
            if status == 'approved':
                move_request_days(leave, 'pending', 'approved')
        return new_days


def recount_leave_days(date_from=None, date_to=None, today=None, apply=False):
    """Recount open vacation requests that have not ended yet; return what changes.

    Skips requests whose year is closed. ``apply=False`` only reports.
    """
    today = today or business_today()
    changes = []
    for leave in _candidates(date_from, date_to, today):
        if is_closed_year(leave.start_date.year):
            continue
        new_days = _count(leave)
        old_days = Decimal(leave.days_counted if leave.days_counted is not None else new_days)
        if new_days == old_days:
            continue
        if apply:
            new_days = _apply(leave.pk)
            if new_days is None:
                continue
        changes.append(RecountChange(
            leave.pk, leave.user_id, leave.status, leave.start_date, leave.end_date, old_days, new_days,
        ))
    return changes
