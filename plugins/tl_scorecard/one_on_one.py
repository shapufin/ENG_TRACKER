"""Recurring 1-on-1 plans for a Line Manager's own team.

A plan only computes the next due slot. It never creates a `Meeting`: a held 1-on-1 is
still logged by the leader (the date prefilled with the due slot) and a skipped one is an
`OneOnOneSkip` with a reason. A skip is not a held meeting and never counts toward
1-on-1 compliance. Dates are business days (Europe/Tirane), never the server clock.
"""
from dataclasses import dataclass
from datetime import date, timedelta

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Max

from apps.leave_management.models import LeaveRequest
from apps.leave_management.models.core import global_holiday_dates
from core.utils.cadence import next_due_slot, schedule_errors
from core.utils.timezone_local import business_today

from .models import Meeting, OneOnOnePlan, OneOnOneSkip
from .scope import scoreable_member_ids

# How far ahead blocked dates (holidays, leave) are looked up for one slot.
LOOKAHEAD_DAYS = 366


@dataclass(frozen=True)
class Slot:
    due_on: date
    status: str  # upcoming | due | overdue
    moved_from: date | None = None
    moved_reason: str | None = None  # holiday | leave


def _check_scope(leader, employee):
    if employee.id not in scoreable_member_ids(leader):
        raise ValidationError({'employee': 'You can only plan 1-on-1s with your own team members.'})


def set_plan(leader, employee, *, cadence, day_of_week, nth_week, effective_from=None):
    """Create or replace the plan for one employee (a full replacement of the schedule)."""
    _check_scope(leader, employee)
    errors = schedule_errors(cadence, day_of_week, nth_week)
    if errors:
        raise ValidationError(errors)
    plan, _ = OneOnOnePlan.objects.update_or_create(
        leader=leader, employee=employee,
        defaults={
            'cadence': cadence,
            'cadence_day_of_week': day_of_week,
            'cadence_nth_week': nth_week,
            'effective_from': effective_from or business_today(),
        },
    )
    return plan


def clear_plan(leader, employee) -> bool:
    """Remove the schedule. Skips already recorded stay as history."""
    deleted, _ = OneOnOnePlan.objects.filter(leader=leader, employee=employee).delete()
    return bool(deleted)


def _expand(ranges, start, end) -> set:
    days = set()
    for first, last in ranges:
        day, stop = max(first, start), min(last, end)
        while day <= stop:
            days.add(day)
            day += timedelta(days=1)
    return days


def next_slots(plans, *, today=None) -> dict:
    """``{plan.id: Slot}`` for many plans in a fixed number of queries.

    The slot is the next one after the latest held 1-on-1 or skip, moved past public
    holidays and the employee's approved whole-day leave (a half day does not block it).
    """
    plans = list(plans)
    if not plans:
        return {}
    today = today or business_today()
    employee_ids = {p.employee_id for p in plans}
    leader_ids = {p.leader_id for p in plans}
    last = {}
    for leader_id, employee_id, latest in Meeting.objects.filter(
        organizer_id__in=leader_ids, counterparty_id__in=employee_ids, meeting_type='one_on_one',
    ).values_list('organizer_id', 'counterparty_id').annotate(d=Max('occurred_on')):
        last[(leader_id, employee_id)] = latest
    for leader_id, employee_id, latest in OneOnOneSkip.objects.filter(
        leader_id__in=leader_ids, employee_id__in=employee_ids,
    ).values_list('leader_id', 'employee_id').annotate(d=Max('slot_date')):
        key = (leader_id, employee_id)
        last[key] = max(last[key], latest) if key in last else latest

    firsts = {}
    for plan in plans:
        firsts[plan.id] = next_due_slot(
            plan.cadence, plan.cadence_day_of_week, plan.cadence_nth_week,
            plan.effective_from, last.get((plan.leader_id, plan.employee_id)), blocked=set(),
        )[0]
    window_start = min(firsts.values())
    window_end = max(firsts.values()) + timedelta(days=LOOKAHEAD_DAYS)
    holidays = global_holiday_dates(window_start, window_end)
    leave_by_employee = {}
    for employee_id, first, final in LeaveRequest.objects.filter(
        user_id__in=employee_ids, status='approved', is_half_day=False,
        start_date__lte=window_end, end_date__gte=window_start,
    ).values_list('user_id', 'start_date', 'end_date'):
        leave_by_employee.setdefault(employee_id, []).append((first, final))

    slots = {}
    for plan in plans:
        first_due = firsts[plan.id]
        leave = _expand(
            leave_by_employee.get(plan.employee_id, []), first_due, first_due + timedelta(days=LOOKAHEAD_DAYS),
        )
        due, moved_from = next_due_slot(
            plan.cadence, plan.cadence_day_of_week, plan.cadence_nth_week, plan.effective_from,
            last.get((plan.leader_id, plan.employee_id)), blocked=holidays | leave,
        )
        reason = None
        if moved_from is not None:
            reason = 'holiday' if moved_from in holidays else 'leave'
        status = 'overdue' if due < today else 'due' if due == today else 'upcoming'
        slots[plan.id] = Slot(due_on=due, status=status, moved_from=moved_from, moved_reason=reason)
    return slots


def next_slot(plan, *, today=None) -> Slot:
    return next_slots([plan], today=today)[plan.id]


def skip_slot(leader, employee, *, reason, recorded_by=None, today=None) -> OneOnOneSkip:
    """Record that the slot now due or overdue will not be held, and why."""
    reason = (reason or '').strip()
    if not reason:
        raise ValidationError({'reason': 'A reason is required to skip a 1-on-1.'})
    today = today or business_today()
    _check_scope(leader, employee)
    plan = OneOnOnePlan.objects.filter(leader=leader, employee=employee).first()
    if plan is None:
        raise ValidationError({'employee': 'There is no 1-on-1 plan for this employee.'})
    slot = next_slot(plan, today=today)
    if slot.due_on > today:
        raise ValidationError({'slot': 'The next 1-on-1 is not due yet, so it cannot be skipped.'})
    try:
        with transaction.atomic():
            return OneOnOneSkip.objects.create(
                leader=leader, employee=employee, slot_date=slot.due_on, reason=reason,
                recorded_by=recorded_by or leader,
            )
    except IntegrityError:
        raise ValidationError({'slot': 'This 1-on-1 was already skipped.'})


def cadence_label(plan) -> str:
    from apps.users.models.hbpr import NTH_WEEK_NAMES, WEEKDAY_NAMES

    day = WEEKDAY_NAMES[plan.cadence_day_of_week] if plan.cadence_day_of_week is not None else None
    if plan.cadence == 'monthly':
        if plan.cadence_nth_week is not None and day:
            return f'Monthly ({NTH_WEEK_NAMES[plan.cadence_nth_week]} {day})'
        return 'Monthly'
    name = 'Weekly' if plan.cadence == 'weekly' else 'Biweekly'
    return f'{name} ({day})' if day else name


def plan_payloads(leader, *, today=None) -> dict:
    """``{employee_id: payload}`` for the Team tab: schedule plus the next slot, in few queries."""
    plans = list(OneOnOnePlan.objects.filter(leader=leader))
    slots = next_slots(plans, today=today)
    return {
        plan.employee_id: {
            'cadence': plan.cadence,
            'cadence_day_of_week': plan.cadence_day_of_week,
            'cadence_nth_week': plan.cadence_nth_week,
            'cadence_display': cadence_label(plan),
            'next_due_on': slots[plan.id].due_on,
            'status': slots[plan.id].status,
            'moved_from': slots[plan.id].moved_from,
            'moved_reason': slots[plan.id].moved_reason,
        }
        for plan in plans
    }


def process_one_on_one_reminders(today=None) -> int:
    """Tell each leader how many 1-on-1s are due or overdue (once a week). Returns leaders told.

    Idempotent through the notification dedupe key. The count carries no names or reasons.
    """
    try:
        from . import notification_types as types
    except ImportError:  # pragma: no cover - notifications plugin not installed
        return 0

    today = today or business_today()
    plans = list(OneOnOnePlan.objects.select_related('leader', 'employee__profile'))
    # Only people still linked to the leader: a plan outlives a move, it must not nag the old leader.
    plans = [
        p for p in plans
        if p.leader.is_active and p.employee.is_active
        and p.leader_id in (p.employee.profile.albanian_tl_id, p.employee.profile.italian_tl_id)
    ]
    due_by_leader = {}
    leader_of = {p.id: p.leader_id for p in plans}
    for plan_id, slot in next_slots(plans, today=today).items():
        if slot.status in ('due', 'overdue'):
            due_by_leader[leader_of[plan_id]] = due_by_leader.get(leader_of[plan_id], 0) + 1
    for leader_id, count in due_by_leader.items():
        types.OneOnOneDue().dispatch({'leader_id': leader_id, 'count': count, 'today': today})
    return len(due_by_leader)


def process_one_on_one_reminders_tick() -> None:
    """Scheduler entry (hourly), next to the HBPR cadence reminders."""
    process_one_on_one_reminders()
