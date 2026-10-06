"""
Computation layer for the TL Scorecard plugin — pure read functions over
`apps/*` data (Phase 1) and this plugin's own Phase 2 models (Meeting,
IdleFlag, ReviewDelivery). Nothing here writes to the DB.

Deliberately never imports `plugins.engagement` or `plugins.skills` — see
the plugin-isolation architecture rule in the approved plan. Anything from
those plugins is composed in the frontend against their own existing APIs.
"""
from __future__ import annotations

import math
from datetime import date, timedelta

from django.utils import timezone

from apps.leave_management.models import LeaveRequest, count_business_days
from apps.overtime.models.core import OvertimeLog

from .scope import scoreable_member_ids
from .models import (
    Absence,
    EPRCycle,
    IdleFlag,
    Meeting,
    PIPRecord,
    PromotionFlag,
    ReviewDelivery,
)

def reporting_period(month: date | None) -> date:
    """Normalize any date within a month to that month's first day — the
    one shared "as-of month" convention every later phase should reuse
    (calendar month, not a rolling window)."""
    target = month or date.today()
    return target.replace(day=1)


def _month_bounds(month: date) -> tuple[date, date]:
    if month.month == 12:
        next_month = month.replace(year=month.year + 1, month=1)
    else:
        next_month = month.replace(month=month.month + 1)
    return month, next_month


def _business_days_elapsed(start, end) -> int:
    """Business days between two datetimes, 0 if decided the same day."""
    if start is None or end is None:
        return 0
    return max(count_business_days(start.date(), end.date()) - 1, 0)


def leave_sla_metrics(team_member_ids, month: date) -> dict:
    """Leave-approval SLA + month-end pending count for a TL's team."""
    month_start, month_end = _month_bounds(month)
    qs = LeaveRequest.objects.filter(
        user_id__in=team_member_ids, submitted_at__gte=month_start, submitted_at__lt=month_end,
    )

    decided = [r for r in qs if r.status in ('approved', 'rejected') and r.approved_at]
    within_2_days = sum(1 for r in decided if _business_days_elapsed(r.submitted_at, r.approved_at) <= 2)
    pct_within_2_days = round((within_2_days / len(decided)) * 100, 1) if decided else None

    pending_at_month_end = LeaveRequest.objects.filter(
        user_id__in=team_member_ids, status='pending', submitted_at__lt=month_end,
    ).count()

    return {
        'decided_count': len(decided),
        'pct_within_2_days': pct_within_2_days,
        'pending_at_month_end': pending_at_month_end,
    }


def ot_turnaround_metrics(team_member_ids, month: date) -> dict:
    """Overtime approval turnaround only — deliberately NOT a measure of
    'unauthorized overtime': that KPI has no data source yet, since
    OvertimeLog has no pre-approval concept."""
    month_start, month_end = _month_bounds(month)
    qs = OvertimeLog.objects.filter(
        user_id__in=team_member_ids, submitted_at__gte=month_start, submitted_at__lt=month_end,
    )
    decided = [r for r in qs if r.status in ('approved', 'rejected') and r.approved_at]
    if not decided:
        return {'decided_count': 0, 'avg_turnaround_days': None}

    total_days = sum(_business_days_elapsed(r.submitted_at, r.approved_at) for r in decided)
    return {
        'decided_count': len(decided),
        'avg_turnaround_days': round(total_days / len(decided), 1),
    }


def meeting_compliance_metrics(leader, team_member_ids, month: date) -> dict:
    """1-on-1 compliance %, TL-sync count, and team-meeting governance —
    all three KPIs the Meeting model covers (gap-audit findings #12/#13)."""
    month_start, month_end = _month_bounds(month)

    one_on_ones = Meeting.objects.filter(
        organizer=leader, meeting_type='one_on_one', occurred_on__gte=month_start, occurred_on__lt=month_end,
    )
    members_with_one_on_one = set(one_on_ones.values_list('counterparty_id', flat=True))
    compliant_members = len(members_with_one_on_one & set(team_member_ids))
    one_on_one_pct = (
        round((compliant_members / len(team_member_ids)) * 100, 1) if team_member_ids else None
    )

    tl_sync_count = Meeting.objects.filter(
        organizer=leader, meeting_type='tl_sync', occurred_on__gte=month_start, occurred_on__lt=month_end,
    ).count()

    team_meetings = list(Meeting.objects.filter(
        organizer=leader, meeting_type='team_meeting', occurred_on__gte=month_start, occurred_on__lt=month_end,
    ).prefetch_related('attendees'))
    # `.attendees.all()`, not `.filter(...)` — the latter bypasses the
    # prefetch_related cache above and re-queries per meeting (N+1).
    held_with_hrbp = sum(1 for m in team_meetings if any(a.role == 'hrbp' for a in m.attendees.all()))
    notes_within_24h = sum(
        1 for m in team_meetings
        if m.notes_published_at and (m.notes_published_at - m.created_at) <= timedelta(hours=24)
    )

    return {
        'one_on_one_compliance_pct': one_on_one_pct,
        'tl_sync_count': tl_sync_count,
        'team_meetings_held': len(team_meetings),
        'team_meetings_with_hrbp': held_with_hrbp,
        'team_meeting_notes_within_24h': notes_within_24h,
    }


def idle_metrics(leader) -> dict:
    """Open/resolved idle-flag counts (gap-audit finding #9). Not
    month-scoped — an idle flag can stay open across month boundaries, so
    "currently open" is more useful than "opened this month"."""
    flags = IdleFlag.objects.filter(flagged_by=leader)
    return {
        'open_count': flags.filter(status='open').count(),
        'resolved_count': flags.filter(status='resolved').count(),
    }


def review_delivery_count(leader, year: int) -> int:
    """Cumulative management-review deliveries for the year (gap-audit
    finding #6 — "≥12 monthly reviews" is a running annual count, not a
    single month's number)."""
    return ReviewDelivery.objects.filter(leader=leader, delivered_on__year=year).count()


def seniority_ratio(team_member_ids) -> dict:
    """Junior/senior workforce ratio (gap-audit finding #1). Lazily
    imports UserProfile — apps.users is a core app, not a plugin, so this
    doesn't violate the plugin-isolation rule."""
    from apps.users.models.core import UserProfile

    counts = {'junior': 0, 'mid': 0, 'senior': 0, 'unset': 0}
    for level in UserProfile.objects.filter(user_id__in=team_member_ids).values_list('seniority_level', flat=True):
        counts[level or 'unset'] += 1
    return counts


# Phase 3's "not typed in" due-date schedule for EPR — tune once, here,
# rather than a TL typing a due date on every cycle.
EPR_STAGE_DUE_MONTH_DAY = {
    'goal_setting': (3, 31),
    'mid_year': (9, 30),
    'final_review': (12, 31),
}

ESCALATION_LEAVE_SLA_DAYS = 2
ESCALATION_IDLE_STALE_WEEKS = 4
ESCALATION_PIP_PENDING_DAYS = 14
ESCALATION_ABSENCE_SLA_DAYS = 5

PROMOTION_TARGET_PCT = 3.0


def absence_metrics(team_member_ids) -> dict:
    """Unaddressed count + 5-working-day SLA breach count (gap-audit
    finding #5). `addressed_on is None` means still open."""
    open_absences = list(Absence.objects.filter(
        employee_id__in=team_member_ids, addressed_on__isnull=True).only('absence_date'))
    today = date.today()
    breached = sum(
        1 for a in open_absences
        if count_business_days(a.absence_date, today) - 1 > ESCALATION_ABSENCE_SLA_DAYS
    )
    return {'open_count': len(open_absences), 'breached_5_day_sla': breached}


def pip_metrics(leader) -> dict:
    """Pending-HR-approval count for a TL's PIPs — "too long" is computed
    from created_at, never typed."""
    pips = PIPRecord.objects.filter(tl=leader)
    pending = pips.filter(approved_at__isnull=True)
    return {'active_count': pips.filter(status='active').count(), 'pending_approval_count': pending.count()}


def promotion_ratio(team_member_ids, year: int) -> dict:
    """3%/year high-potential target (gap-audit finding). Nomination is
    manual; this ratio is fully automatic."""
    team_size = len(team_member_ids)
    promoted = PromotionFlag.objects.filter(
        employee_id__in=team_member_ids, status='promoted', decided_on__year=year,
    ).count()
    pct = round((promoted / team_size) * 100, 1) if team_size else None
    return {'promoted_count': promoted, 'team_size': team_size, 'promoted_pct': pct, 'target_pct': PROMOTION_TARGET_PCT}


def epr_stage_due_date(year: int, stage: str) -> date:
    month, day = EPR_STAGE_DUE_MONTH_DAY[stage]
    return date(year, month, day)


def epr_metrics(team_member_ids, year: int) -> dict:
    """Per-stage on-time completion for a TL's team this year. Due dates
    come from epr_stage_due_date(), never from a typed-in field."""
    cycles = list(
        EPRCycle.objects.filter(user_id__in=team_member_ids, year=year)
        .prefetch_related('goals', 'stage_records')
    )
    total = len(team_member_ids)
    stages = {}
    stages_completed = 0
    for stage in EPR_STAGE_DUE_MONTH_DAY:
        field = f'{stage}_completed_at'
        due = epr_stage_due_date(year, stage)
        on_time = sum(
            1 for c in cycles
            if getattr(c, field) and getattr(c, field).date() <= due
        )
        stages_completed += sum(1 for c in cycles if getattr(c, field))
        stages[stage] = {
            'due_date': due.isoformat(),
            'completed_on_time': on_time,
            'team_size': total,
            'pct_on_time': round((on_time / total) * 100, 1) if total else None,
        }
    goals_met = sum(1 for c in cycles if len(c.goals.all()) >= 5)
    stages_with_evidence = sum(
        1 for c in cycles
        for r in c.stage_records.all()
        if getattr(c, f'{r.stage}_completed_at')
    )
    return {
        'stages': stages,
        'cycles_with_5plus_goals': goals_met,
        'cycles_started': len(cycles),
        'stages_completed': stages_completed,
        'stages_with_evidence': stages_with_evidence,
    }


def _pack_name(user):
    if user is None:
        return None
    return user.get_full_name() or user.username


def build_year_end_pack(assignment, year: int, evidence_qs) -> dict:
    """Held-vs-expected cadence + EPR participations for one assignment+year
    — the packaged summary the AL TL hands to their manager at year-end.

    Expected-meeting window: ``max(effective_from, Jan 1)`` →
    ``min(effective_to, Dec 31, today)`` (a current assignment can't owe a
    future meeting). Weekly → ceil(days/7); biweekly → ceil(days/14);
    monthly → calendar months touched.

    ``evidence_qs`` is the caller's already-scoped evidence queryset — the
    viewset passes ``self._scoped_queryset()`` (the pack's own ``?year=``
    must not hit the list's ``reporting_year`` row filter, which would drop
    every NULL-year cadence meeting).
    """
    rows = list(
        evidence_qs.filter(assignment=assignment)
        .select_related('recorded_by')
        .order_by('occurred_on', 'id')
    )
    meetings = [r for r in rows if r.kind == 'cadence_meeting'
                and r.occurred_on.year == year]
    epr_mid = next(
        (r for r in rows if r.kind == 'epr_mid_year' and r.reporting_year == year), None)
    epr_end = next(
        (r for r in rows if r.kind == 'epr_year_end' and r.reporting_year == year), None)

    window_start = max(assignment.effective_from, date(year, 1, 1))
    # The app clock (timezone.now().date(), same as hbpr_assignments.today()),
    # not the host's local date — the two can differ across midnight.
    window_end = min(
        assignment.effective_to or date.max,
        date(year, 12, 31),
        timezone.now().date(),
    )
    if window_end < window_start:
        expected = 0
    else:
        days = (window_end - window_start).days + 1
        if assignment.cadence == 'weekly':
            expected = math.ceil(days / 7)
        elif assignment.cadence == 'biweekly':
            expected = math.ceil(days / 14)
        else:  # monthly
            expected = (window_end.year * 12 + window_end.month) \
                - (window_start.year * 12 + window_start.month) + 1
    held = len(meetings)

    def _row(r):
        if r is None:
            return None
        return {
            'id': r.id,
            'occurred_on': r.occurred_on.isoformat(),
            'shared_summary': r.shared_summary,
            'action_items': r.action_items,
            'reference_url': r.reference_url,
            'recorded_by_name': _pack_name(r.recorded_by),
        }

    return {
        'assignment': {
            'id': assignment.id,
            'albanian_tl_name': _pack_name(assignment.albanian_tl),
            'hbpr_name': _pack_name(assignment.hbpr),
            'cadence': assignment.cadence,
            'effective_from': assignment.effective_from.isoformat(),
            'effective_to': assignment.effective_to.isoformat()
            if assignment.effective_to else None,
        },
        'year': year,
        'cadence_expected': expected,
        'cadence_held': held,
        'coverage_pct': round((held / expected) * 100, 1) if expected else None,
        'meetings': [_row(r) for r in meetings],
        'epr_mid_year': _row(epr_mid),
        'epr_year_end': _row(epr_end),
    }


def scorecard_trend(user, months: int, end_month: date) -> list[dict]:
    """Last `months` calendar months of `build_scorecard`, oldest first —
    reuses the existing per-month function as-is, no new metric logic and
    no snapshot model (same "computed live" approach as the rest of this
    plugin)."""
    end = reporting_period(end_month)
    points = []
    cursor = end
    for _ in range(months):
        points.append(build_scorecard(user, cursor))
        if cursor.month == 1:
            cursor = cursor.replace(year=cursor.year - 1, month=12)
        else:
            cursor = cursor.replace(month=cursor.month - 1)
    return list(reversed(points))


def escalation_candidates(leader) -> list[dict]:
    """Computed, not logged — surfaces anything that would become an
    escalation if left unhandled, from data already tracked elsewhere.
    Directly answers "0 escalations from administrative delays" without a
    single new manual entry."""
    team_member_ids = scoreable_member_ids(leader)
    today = date.today()
    candidates = []

    for r in LeaveRequest.objects.filter(
            user_id__in=team_member_ids, status='pending').select_related('user'):
        elapsed = count_business_days(r.submitted_at.date(), today) - 1 if r.submitted_at else 0
        if elapsed > ESCALATION_LEAVE_SLA_DAYS:
            candidates.append({
                'kind': 'leave_pending', 'subject_id': r.user_id, 'subject_name': str(r.user),
                'detail': f'Leave request pending {elapsed} business days (SLA: {ESCALATION_LEAVE_SLA_DAYS}).',
                'since': r.submitted_at.date(),
            })

    stale_cutoff = today - timedelta(weeks=ESCALATION_IDLE_STALE_WEEKS)
    for flag in IdleFlag.objects.filter(
            flagged_by=leader, status='open').select_related('employee').prefetch_related('status_updates'):
        latest_update = max((u.week_of for u in flag.status_updates.all()), default=None)
        last_activity = latest_update or flag.flagged_on
        if last_activity < stale_cutoff:
            candidates.append({
                'kind': 'idle_flag_stale', 'subject_id': flag.employee_id, 'subject_name': str(flag.employee),
                'detail': f'Idle flag open with no status update since {last_activity}.',
                'since': last_activity,
            })

    pip_cutoff = today - timedelta(days=ESCALATION_PIP_PENDING_DAYS)
    for pip in PIPRecord.objects.filter(
            tl=leader, approved_at__isnull=True, created_at__date__lt=pip_cutoff).select_related('employee'):
        candidates.append({
            'kind': 'pip_pending_approval', 'subject_id': pip.employee_id, 'subject_name': str(pip.employee),
            'detail': f'PIP still pending HR approval since {pip.created_at.date()}.',
            'since': pip.created_at.date(),
        })

    for a in Absence.objects.filter(
            flagged_by=leader, addressed_on__isnull=True).select_related('employee'):
        elapsed = count_business_days(a.absence_date, today) - 1
        if elapsed > ESCALATION_ABSENCE_SLA_DAYS:
            candidates.append({
                'kind': 'absence_unaddressed', 'subject_id': a.employee_id, 'subject_name': str(a.employee),
                'detail': f'Absence on {a.absence_date} unaddressed for {elapsed} business days.',
                'since': a.absence_date,
            })

    return candidates


def governance_records(leader, team_member_ids, year: int, subject_ids=None) -> dict:
    """Row-level detail (not just counts) for the export workbook's
    Governance sheet — open PIPs, open absences, pending promotion flags,
    and in-progress EPR cycles for this TL's team. Reuses the same
    querysets as pip_metrics/absence_metrics/promotion_ratio/epr_metrics,
    just without collapsing them to counts.

    ``subject_ids`` (when given) limits PIP/absence/promotion rows to those
    employees, so a viewer scoped to a subset never sees a record about someone
    outside it just because the TL once wrote it."""
    def _limit(qs, field):
        return qs if subject_ids is None else qs.filter(**{f'{field}__in': subject_ids})

    open_pips = [
        {'employee': str(p.employee), 'status': p.status, 'start_date': p.start_date.isoformat(),
         'approved': p.approved_at is not None}
        for p in _limit(PIPRecord.objects.filter(tl=leader), 'employee_id')
        .exclude(status__in=('completed', 'cancelled')).select_related('employee')
    ]
    open_absences = [
        {'employee': str(a.employee), 'absence_date': a.absence_date.isoformat(), 'reason': a.reason}
        for a in _limit(Absence.objects.filter(flagged_by=leader, addressed_on__isnull=True), 'employee_id')
        .select_related('employee')
    ]
    pending_promotions = [
        {'employee': str(p.employee), 'nominated_on': p.nominated_on.isoformat()}
        for p in _limit(PromotionFlag.objects.filter(nominated_by=leader, status='nominated'), 'employee_id')
        .select_related('employee')
    ]
    in_progress_cycles = [
        {
            'employee': str(c.user), 'year': c.year,
            'goal_setting_done': c.goal_setting_completed_at is not None,
            'mid_year_done': c.mid_year_completed_at is not None,
            'final_review_done': c.final_review_completed_at is not None,
            'goal_count': len(c.goals.all()),
        }
        for c in EPRCycle.objects.filter(user_id__in=team_member_ids, year=year)
        .select_related('user').prefetch_related('goals')
    ]
    return {
        'open_pips': open_pips,
        'open_absences': open_absences,
        'pending_promotions': pending_promotions,
        'epr_cycles': in_progress_cycles,
    }


def build_scorecard(user, month: date) -> dict:
    """Full scorecard for one TL (`user`) for `month`."""
    team_member_ids = scoreable_member_ids(user)
    month = reporting_period(month)
    return {
        'month': month.isoformat(),
        'team_size': len(team_member_ids),
        'leave': leave_sla_metrics(team_member_ids, month),
        'overtime': ot_turnaround_metrics(team_member_ids, month),
        'meetings': meeting_compliance_metrics(user, team_member_ids, month),
        'idle': idle_metrics(user),
        'review_deliveries_ytd': review_delivery_count(user, month.year),
        'seniority': seniority_ratio(team_member_ids),
        'absences': absence_metrics(team_member_ids),
        'pip': pip_metrics(user),
        'promotion': promotion_ratio(team_member_ids, month.year),
        'escalation_count': len(escalation_candidates(user)),
    }
