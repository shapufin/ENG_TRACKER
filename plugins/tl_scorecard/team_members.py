"""Per-member summary for the TL scorecard Team tab.

The whole team is read by ONE member query: every per-member figure (wage,
leave totals, EPR, governance counts, last one-on-one) is a correlated
subquery annotated onto the member rows, so the query count does not grow with
the team. Only the upcoming-leave list is a second query, because it returns
rows rather than a figure. "Open" means what the scorecard headline counts
mean: PIPs not completed/cancelled (`governance_records`), absences unaddressed
(`absence_metrics`), idle flags still `open` (`idle_metrics`), promotion
nominations still `nominated` (`governance_records`).
"""
from calendar import monthrange
from collections import defaultdict
from datetime import date
from decimal import Decimal

from django.contrib.auth.models import User
from django.db.models import Count, DecimalField, Exists, IntegerField, Max, OuterRef, Q, Subquery, Sum
from django.db.models.functions import Coalesce

from apps.leave_management.models import LeaveBalance, LeaveRequest

from .models import Absence, EPRCycle, EPRGoal, IdleFlag, Meeting, PIPRecord, PromotionFlag
from .scope import scoreable_member_ids

ZERO = Decimal('0.0')
EPR_STAGES = ('goal_setting', 'mid_year', 'final_review')
CLOSED_PIP_STATUSES = ('completed', 'cancelled')


def _count_for(queryset):
    """Correlated COUNT of `queryset` for the outer member row; 0 when none."""
    return Coalesce(
        Subquery(
            queryset.order_by().values('employee_id').annotate(n=Count('id')).values('n')[:1],
            output_field=IntegerField(),
        ),
        0,
    )


def _wage_annotations(month_start, month_end):
    """Current-month wage annotations, or None when payroll is not importable
    or an admin has disabled it (a disabled plugin must not expose its data).

    Mirrors `WageAssignment.resolve_for_month` (plugins/payroll/models.py:227-263):
    active assignments overlapping the month. Exactly one gives `ok`; none or
    several give `missing`, so the count is annotated alongside the value.
    """
    try:
        from plugins.payroll.models import WageAssignment
    except ImportError:
        return None

    from apps.plugins.models import Plugin
    if Plugin.objects.filter(name='payroll', is_enabled=False).exists():
        return None

    applicable = WageAssignment.objects.filter(
        user=OuterRef('pk'), is_active=True, effective_from__lte=month_end,
    ).filter(Q(effective_to__isnull=True) | Q(effective_to__gte=month_start))
    return {
        'wage_count': Coalesce(
            Subquery(
                applicable.order_by().values('user').annotate(n=Count('id')).values('n')[:1],
                output_field=IntegerField(),
            ),
            0,
        ),
        'wage_amount': Subquery(applicable.order_by('-effective_from').values('gross_monthly_wage')[:1]),
        'wage_from': Subquery(applicable.order_by('-effective_from').values('effective_from')[:1]),
    }


def _leave_annotations(year):
    def _sum(field):
        return Coalesce(
            Subquery(
                LeaveBalance.objects.filter(user=OuterRef('pk'), year=year)
                .order_by().values('user').annotate(s=Sum(field)).values('s')[:1],
                output_field=DecimalField(max_digits=6, decimal_places=1),
            ),
            ZERO,
            output_field=DecimalField(max_digits=6, decimal_places=1),
        )

    return {
        'leave_total': _sum('total_days'),
        'leave_used': _sum('used_days'),
        'leave_pending': _sum('pending_days'),
    }


def _epr_annotations(year):
    cycles = EPRCycle.objects.filter(user=OuterRef('pk'), year=year)
    return {
        'epr_goal_count': Coalesce(
            Subquery(
                EPRGoal.objects.filter(cycle__user=OuterRef('pk'), cycle__year=year)
                .order_by().values('cycle__user').annotate(n=Count('id')).values('n')[:1],
                output_field=IntegerField(),
            ),
            0,
        ),
        'epr_goal_setting_done': Exists(cycles.filter(goal_setting_completed_at__isnull=False)),
        'epr_mid_year_done': Exists(cycles.filter(mid_year_completed_at__isnull=False)),
        'epr_final_review_done': Exists(cycles.filter(final_review_completed_at__isnull=False)),
    }


def _governance_annotations(leader):
    # Same definitions as the scorecard's own counts (see module docstring).
    return {
        'pip_status': Subquery(
            PIPRecord.objects.filter(employee=OuterRef('pk'), tl=leader)
            .exclude(status__in=CLOSED_PIP_STATUSES).order_by('-id').values('status')[:1]
        ),
        'idle_open': _count_for(IdleFlag.objects.filter(
            employee=OuterRef('pk'), flagged_by=leader, status='open')),
        'absences_open': _count_for(Absence.objects.filter(
            employee=OuterRef('pk'), addressed_on__isnull=True)),
        'promotion_pending': Exists(PromotionFlag.objects.filter(
            employee=OuterRef('pk'), nominated_by=leader, status='nominated')),
    }


def _upcoming_leave(member_ids, today):
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
            'business_days': request.days_requested,
        })
    return upcoming


def team_member_summaries(leader, today: date, include_meetings: bool) -> list[dict]:
    """One summary per scoreable member of `leader`'s team, ordered by name.

    `include_meetings` is decided by the caller: one-on-one dates are only ever
    returned to the leader themself or to staff (see `_mask_one_on_one`).
    """
    member_ids = list(scoreable_member_ids(leader))
    if not member_ids:
        return []

    month_start = today.replace(day=1)
    month_end = today.replace(day=monthrange(today.year, today.month)[1])
    wage_annotations = _wage_annotations(month_start, month_end)

    annotations = {
        **_leave_annotations(today.year),
        **_epr_annotations(today.year),
        **_governance_annotations(leader),
    }
    if wage_annotations is not None:
        annotations.update(wage_annotations)
    if include_meetings:
        annotations['last_one_on_one'] = Subquery(
            Meeting.objects.filter(
                organizer=leader, meeting_type='one_on_one', counterparty=OuterRef('pk'),
            ).order_by().values('counterparty').annotate(last=Max('occurred_on')).values('last')[:1]
        )

    members = list(
        User.objects.filter(id__in=member_ids, is_active=True)
        .select_related('profile')
        .annotate(**annotations)
        .order_by('last_name', 'first_name', 'username')
    )
    upcoming = _upcoming_leave([member.id for member in members], today)

    rows = []
    for member in members:
        profile = getattr(member, 'profile', None)
        total = member.leave_total
        used = member.leave_used
        pending = member.leave_pending
        if wage_annotations is None:
            wage = {'gross_monthly': None, 'effective_from': None, 'status': 'unavailable'}
        elif member.wage_count == 1:
            wage = {
                'gross_monthly': member.wage_amount,
                'effective_from': member.wage_from,
                'status': 'ok',
            }
        elif member.wage_count > 1:
            wage = {'gross_monthly': None, 'effective_from': None, 'status': 'conflict'}
        else:
            wage = {'gross_monthly': None, 'effective_from': None, 'status': 'missing'}
        epr_done = {
            'goal_setting': member.epr_goal_setting_done,
            'mid_year': member.epr_mid_year_done,
            'final_review': member.epr_final_review_done,
        }
        rows.append({
            'id': member.id,
            'full_name': member.get_full_name() or member.username,
            'username': member.username,
            'email': member.email,
            'code': profile.code if profile is not None else None,
            'seniority_level': profile.seniority_level if profile is not None else None,
            'wage': wage,
            'leave': {
                'total_days': total,
                'used_days': used,
                'pending_days': pending,
                'available_days': total - used - pending,
                'upcoming': upcoming.get(member.id, []),
            },
            'epr': {
                'year': today.year,
                'goal_count': member.epr_goal_count,
                'goal_setting_done': epr_done['goal_setting'],
                'mid_year_done': epr_done['mid_year'],
                'final_review_done': epr_done['final_review'],
                'next_stage': next((stage for stage in EPR_STAGES if not epr_done[stage]), None),
            },
            'governance': {
                'open_pip': member.pip_status is not None,
                'pip_status': member.pip_status,
                'open_idle_flags': member.idle_open,
                'open_absences': member.absences_open,
                'pending_promotion': member.promotion_pending,
            },
            'meetings': {
                'last_one_on_one_on': member.last_one_on_one if include_meetings else None,
            },
        })
    return rows
