"""Per-member summary for the TL scorecard Team tab.

Every collection is loaded with one bulk query over the whole team and grouped
in Python, so the query budget stays constant as the team grows (no per-member
queries). "Open" means the same thing the scorecard headline counts mean:
PIPs not completed/cancelled (`governance_records`), absences unaddressed
(`absence_metrics`), idle flags still `open` (`idle_metrics`), promotion
nominations still `nominated` (`governance_records`).
"""
from calendar import monthrange
from collections import defaultdict
from datetime import date
from decimal import Decimal

from django.contrib.auth.models import User
from django.db.models import Count, Max, Q

from apps.leave_management.models import LeaveBalance, LeaveRequest, count_business_days

from .models import Absence, EPRCycle, IdleFlag, Meeting, PIPRecord, PromotionFlag
from .scope import scoreable_member_ids

ZERO = Decimal('0.0')
EPR_STAGES = ('goal_setting', 'mid_year', 'final_review')
CLOSED_PIP_STATUSES = ('completed', 'cancelled')


def _wages_for_month(member_ids, today):
    """Wage per member for the current month, or None when payroll is not importable.

    Mirrors `WageAssignment.resolve_for_month` (plugins/payroll/models.py:227-263):
    active assignments overlapping the month; exactly one is `ok`, none is
    `missing`, several is `missing` (ambiguous, no value shown).
    """
    try:
        from plugins.payroll.models import WageAssignment
    except ImportError:
        return None

    month_start = today.replace(day=1)
    month_end = today.replace(day=monthrange(today.year, today.month)[1])
    candidates = defaultdict(list)
    rows = WageAssignment.objects.filter(
        user_id__in=member_ids, is_active=True, effective_from__lte=month_end,
    ).filter(Q(effective_to__isnull=True) | Q(effective_to__gte=month_start))
    for wage in rows.order_by('-effective_from'):
        candidates[wage.user_id].append(wage)

    summary = {}
    for user_id in member_ids:
        found = candidates.get(user_id, [])
        if len(found) == 1:
            wage = found[0]
            summary[user_id] = {
                'gross_monthly': wage.gross_monthly_wage,
                'effective_from': wage.effective_from,
                'status': 'ok',
            }
        else:
            summary[user_id] = {
                'gross_monthly': None,
                'effective_from': None,
                'status': 'missing',
            }
    return summary


def _leave_for_year(member_ids, today):
    totals = defaultdict(lambda: {'total_days': ZERO, 'used_days': ZERO, 'pending_days': ZERO})
    for balance in LeaveBalance.objects.filter(user_id__in=member_ids, year=today.year):
        bucket = totals[balance.user_id]
        bucket['total_days'] += balance.total_days
        bucket['used_days'] += balance.used_days
        bucket['pending_days'] += balance.pending_days

    upcoming = defaultdict(list)
    approved = LeaveRequest.objects.filter(
        user_id__in=member_ids, status='approved',
        start_date__year=today.year, end_date__gte=today,
    ).order_by('start_date')
    for request in approved:
        upcoming[request.user_id].append({
            'start_date': request.start_date,
            'end_date': request.end_date,
            'request_type': request.request_type,
            # Same counting rule as the leave balance itself.
            'business_days': count_business_days(request.start_date, request.end_date),
        })

    summary = {}
    for user_id in member_ids:
        bucket = totals[user_id]
        summary[user_id] = {
            **bucket,
            'available_days': bucket['total_days'] - bucket['used_days'] - bucket['pending_days'],
            'upcoming': upcoming.get(user_id, []),
        }
    return summary


def _epr_for_year(member_ids, year):
    cycles = {
        cycle.user_id: cycle
        for cycle in EPRCycle.objects.filter(user_id__in=member_ids, year=year).annotate(goal_count=Count('goals'))
    }
    summary = {}
    for user_id in member_ids:
        cycle = cycles.get(user_id)
        done = {
            'goal_setting': cycle is not None and cycle.goal_setting_completed_at is not None,
            'mid_year': cycle is not None and cycle.mid_year_completed_at is not None,
            'final_review': cycle is not None and cycle.final_review_completed_at is not None,
        }
        next_stage = next((stage for stage in EPR_STAGES if not done[stage]), None)
        summary[user_id] = {
            'year': year,
            'goal_count': cycle.goal_count if cycle is not None else 0,
            'goal_setting_done': done['goal_setting'],
            'mid_year_done': done['mid_year'],
            'final_review_done': done['final_review'],
            'next_stage': next_stage,
        }
    return summary


def _governance_for_members(leader, member_ids):
    pip_status = {}
    for employee_id, status in (
        PIPRecord.objects.filter(employee_id__in=member_ids, tl=leader)
        .exclude(status__in=CLOSED_PIP_STATUSES).order_by('-id').values_list('employee_id', 'status')
    ):
        pip_status.setdefault(employee_id, status)

    idle = dict(
        IdleFlag.objects.filter(employee_id__in=member_ids, flagged_by=leader, status='open')
        .order_by().values('employee_id').annotate(n=Count('id')).values_list('employee_id', 'n')
    )
    absences = dict(
        Absence.objects.filter(employee_id__in=member_ids, addressed_on__isnull=True)
        .order_by().values('employee_id').annotate(n=Count('id')).values_list('employee_id', 'n')
    )
    promotions = set(
        PromotionFlag.objects.filter(employee_id__in=member_ids, nominated_by=leader, status='nominated')
        .values_list('employee_id', flat=True)
    )

    return {
        user_id: {
            'open_pip': user_id in pip_status,
            'pip_status': pip_status.get(user_id),
            'open_idle_flags': idle.get(user_id, 0),
            'open_absences': absences.get(user_id, 0),
            'pending_promotion': user_id in promotions,
        }
        for user_id in member_ids
    }


def _last_one_on_ones(leader, member_ids):
    return dict(
        Meeting.objects.filter(organizer=leader, meeting_type='one_on_one', counterparty_id__in=member_ids)
        .order_by().values('counterparty_id').annotate(last=Max('occurred_on')).values_list('counterparty_id', 'last')
    )


def team_member_summaries(leader, today: date, include_meetings: bool) -> list[dict]:
    """One summary per scoreable member of `leader`'s team, ordered by name.

    `include_meetings` is decided by the caller: one-on-ones are only ever
    returned to the leader themself or to staff (see `_mask_one_on_one`).
    """
    member_ids = list(scoreable_member_ids(leader))
    if not member_ids:
        return []

    members = list(
        User.objects.filter(id__in=member_ids, is_active=True)
        .select_related('profile').order_by('last_name', 'first_name', 'username')
    )
    member_ids = [member.id for member in members]
    wages = _wages_for_month(member_ids, today)
    leave = _leave_for_year(member_ids, today)
    epr = _epr_for_year(member_ids, today.year)
    governance = _governance_for_members(leader, member_ids)
    meetings = _last_one_on_ones(leader, member_ids) if include_meetings else {}

    rows = []
    for member in members:
        profile = getattr(member, 'profile', None)
        rows.append({
            'id': member.id,
            'full_name': member.get_full_name() or member.username,
            'username': member.username,
            'email': member.email,
            'seniority_level': profile.seniority_level if profile is not None else None,
            'wage': (
                {'gross_monthly': None, 'effective_from': None, 'status': 'unavailable'}
                if wages is None else wages[member.id]
            ),
            'leave': leave[member.id],
            'epr': epr[member.id],
            'governance': governance[member.id],
            'meetings': {
                'last_one_on_one_on': meetings.get(member.id) if include_meetings else None,
            },
        })
    return rows
