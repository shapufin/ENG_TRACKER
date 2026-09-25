"""
Computation layer for the TL Scorecard plugin — pure read functions over
`apps/*` data (Phase 1) and this plugin's own Phase 2 models (Meeting,
IdleFlag, ReviewDelivery). Nothing here writes to the DB.

Deliberately never imports `plugins.engagement` or `plugins.skills` — see
the plugin-isolation architecture rule in the approved plan. Anything from
those plugins is composed in the frontend against their own existing APIs.
"""
from __future__ import annotations

from datetime import date, timedelta

from apps.leave_management.models import LeaveRequest, count_business_days
from apps.overtime.models.core import OvertimeLog

from .models import Absence, EPRCycle, IdleFlag, Meeting, PIPRecord, PromotionFlag, ReviewDelivery

# Every KPI from both TL job-description sheets, with its current coverage
# status. A plain data structure (not a model) — it only changes when a
# later phase actually ships that KPI. Powers the frontend's "KPI Coverage"
# panel so nothing this effort is meant to eventually cover is silently
# invisible while it's still unbuilt.
KPI_COVERAGE = [
    {
        "kpi": "Leave requests decided within 2 working days",
        "sheet": 2, "status": "measured", "phase": 1,
        "note": "Computed live from LeaveRequest.submitted_at/approved_at.",
    },
    {
        "kpi": "0 pending leave requests at month-end",
        "sheet": 2, "status": "measured", "phase": 1,
        "note": "Computed live from LeaveRequest.status at month boundary.",
    },
    {
        "kpi": "Overtime approval turnaround",
        "sheet": 2, "status": "measured", "phase": 1,
        "note": "Turnaround time only — see 'Zero unauthorized overtime' below for why this isn't that KPI.",
    },
    {
        "kpi": "Engagement score ≥ 8.5/10",
        "sheet": 1, "status": "measured", "phase": 2,
        "note": (
            "Two numbers now exist: the engagement plugin's approval-behavior score "
            "(speed/consistency, not sentiment — shown as a labeled proxy) and the new "
            "EngagementSurveyResponse pulse score, aggregated team-wide via "
            "team-average/ so individual responses stay anonymous to the TL."
        ),
    },
    {
        "kpi": "Certification achievement via Skills Matrix",
        "sheet": 1, "status": "approximate", "phase": 2,
        "note": (
            "Skill.is_certifiable + UserSkill.certified_on now exist on the skills plugin, "
            "but no aggregate count is exposed through its API yet — fields are there, "
            "the number on this page isn't. Small follow-up to the skills plugin, not tl_scorecard."
        ),
    },
    {
        "kpi": "Balanced junior/senior workforce ratio",
        "sheet": 1, "status": "measured", "phase": 2,
        "note": "UserProfile.seniority_level (apps/users, a core app) — populated manually, ratio computed live.",
    },
    {
        "kpi": "1-on-1 compliance (≥1/member/month)",
        "sheet": 1, "status": "measured", "phase": 2,
        "note": "Meeting(meeting_type=one_on_one) — % of team members with ≥1 logged this month.",
    },
    {
        "kpi": "≥45 documented Technical Lead syncs",
        "sheet": 1, "status": "measured", "phase": 2,
        "note": "Meeting(meeting_type=tl_sync) — cumulative count over the requested date range.",
    },
    {
        "kpi": "Monthly team meetings with HRBP, notes within 24h",
        "sheet": 2, "status": "measured", "phase": 2,
        "note": "Meeting(meeting_type=team_meeting) + MeetingAttendee(role=hrbp) + notes_published_at SLA check.",
    },
    {
        "kpi": "Idle risks flagged with weekly status reporting",
        "sheet": 2, "status": "measured", "phase": 2,
        "note": "IdleFlag + IdleStatusUpdate — open/resolved counts and weekly-log presence.",
    },
    {
        "kpi": "≥12 monthly management reviews to Ops/GM",
        "sheet": 2, "status": "measured", "phase": 2,
        "note": "ReviewDelivery — cumulative count over the requested date range.",
    },
    {
        "kpi": "Zero unauthorized overtime",
        "sheet": 2, "status": "blocked", "phase": 3,
        "note": "OvertimeLog has no pre-approval concept — needs an ops decision on how 'authorized before work' is actually tracked.",
    },
    {
        "kpi": "Regretted voluntary turnover < 7%",
        "sheet": 1, "status": "blocked", "phase": 3,
        "note": "Needs HR to define the voluntary/regretted taxonomy before a termination model can be designed.",
    },
    {
        "kpi": "Unjustified absences addressed within 5 working days",
        "sheet": 2, "status": "measured", "phase": 3,
        "note": "Absence model — flagged manually, 5-working-day SLA computed automatically.",
    },
    {
        "kpi": "0 escalations from administrative delays/communication failures",
        "sheet": 1, "status": "measured", "phase": 3,
        "note": (
            "No manual escalation log — computed live from breaches already tracked: "
            "stale leave decisions, idle flags open >4 weeks with no update, PIPs pending "
            "approval >14 days, absences unaddressed >5 working days."
        ),
    },
    {
        "kpi": "HR Albania formal communications correctly routed/documented",
        "sheet": 1, "status": "planned", "phase": 3,
        "note": "Needs HR to define the taxonomy of formal-communication types first.",
    },
    {
        "kpi": "100% timely EPR completion (3 stages, ≥5 goals/member)",
        "sheet": 2, "status": "measured", "phase": 3,
        "note": (
            "EPRCycle+EPRGoal — due dates computed from the year (Q1/Q3/Q4-end), never typed; "
            "≥5-goal rule enforced before Goal Setting can be marked complete."
        ),
    },
    {
        "kpi": "PIPs executed only with prior HR approval, evidence-based",
        "sheet": 2, "status": "measured", "phase": 3,
        "note": "PIPRecord.approved_by/approved_at — pending-too-long computed automatically, not typed.",
    },
    {
        "kpi": "100% onboarding sign-offs before start date",
        "sheet": 2, "status": "planned", "phase": 3,
        "note": "Onboarding plugin is currently pure file storage — needs a plan/checklist + approval state.",
    },
    {
        "kpi": "High-potential members identified for promotion (3%/year)",
        "sheet": 1, "status": "measured", "phase": 3,
        "note": "PromotionFlag — nomination is manual, the 3%-of-team ratio is computed automatically.",
    },
    {
        "kpi": "34% female headcount (Group diversity target)",
        "sheet": 1, "status": "excluded", "phase": None,
        "note": "Explicitly excluded from this effort pending HR decisions on collecting/storing gender data.",
    },
]


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
    'unauthorized overtime' (see KPI_COVERAGE: that KPI has no data source
    yet, since OvertimeLog has no pre-approval concept)."""
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
    absences = Absence.objects.filter(employee_id__in=team_member_ids)
    today = date.today()
    open_absences = [a for a in absences if a.addressed_on is None]
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
    cycles = list(EPRCycle.objects.filter(user_id__in=team_member_ids, year=year).prefetch_related('goals'))
    total = len(team_member_ids)
    stages = {}
    for stage in EPR_STAGE_DUE_MONTH_DAY:
        field = f'{stage}_completed_at'
        due = epr_stage_due_date(year, stage)
        on_time = sum(
            1 for c in cycles
            if getattr(c, field) and getattr(c, field).date() <= due
        )
        stages[stage] = {
            'due_date': due.isoformat(),
            'completed_on_time': on_time,
            'team_size': total,
            'pct_on_time': round((on_time / total) * 100, 1) if total else None,
        }
    goals_met = sum(1 for c in cycles if c.goals.count() >= 5)
    return {'stages': stages, 'cycles_with_5plus_goals': goals_met, 'cycles_started': len(cycles)}


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
    team_member_ids = leader.profile.get_team_member_ids()
    today = date.today()
    candidates = []

    for r in LeaveRequest.objects.filter(user_id__in=team_member_ids, status='pending'):
        elapsed = count_business_days(r.submitted_at.date(), today) - 1 if r.submitted_at else 0
        if elapsed > ESCALATION_LEAVE_SLA_DAYS:
            candidates.append({
                'kind': 'leave_pending', 'subject_id': r.user_id, 'subject_name': str(r.user),
                'detail': f'Leave request pending {elapsed} business days (SLA: {ESCALATION_LEAVE_SLA_DAYS}).',
                'since': r.submitted_at.date(),
            })

    stale_cutoff = today - timedelta(weeks=ESCALATION_IDLE_STALE_WEEKS)
    for flag in IdleFlag.objects.filter(flagged_by=leader, status='open').prefetch_related('status_updates'):
        latest_update = max((u.week_of for u in flag.status_updates.all()), default=None)
        last_activity = latest_update or flag.flagged_on
        if last_activity < stale_cutoff:
            candidates.append({
                'kind': 'idle_flag_stale', 'subject_id': flag.employee_id, 'subject_name': str(flag.employee),
                'detail': f'Idle flag open with no status update since {last_activity}.',
                'since': last_activity,
            })

    pip_cutoff = today - timedelta(days=ESCALATION_PIP_PENDING_DAYS)
    for pip in PIPRecord.objects.filter(tl=leader, approved_at__isnull=True, created_at__date__lt=pip_cutoff):
        candidates.append({
            'kind': 'pip_pending_approval', 'subject_id': pip.employee_id, 'subject_name': str(pip.employee),
            'detail': f'PIP still pending HR approval since {pip.created_at.date()}.',
            'since': pip.created_at.date(),
        })

    for a in Absence.objects.filter(flagged_by=leader, addressed_on__isnull=True):
        elapsed = count_business_days(a.absence_date, today) - 1
        if elapsed > ESCALATION_ABSENCE_SLA_DAYS:
            candidates.append({
                'kind': 'absence_unaddressed', 'subject_id': a.employee_id, 'subject_name': str(a.employee),
                'detail': f'Absence on {a.absence_date} unaddressed for {elapsed} business days.',
                'since': a.absence_date,
            })

    return candidates


def governance_records(leader, team_member_ids, year: int) -> dict:
    """Row-level detail (not just counts) for the export workbook's
    Governance sheet — open PIPs, open absences, pending promotion flags,
    and in-progress EPR cycles for this TL's team. Reuses the same
    querysets as pip_metrics/absence_metrics/promotion_ratio/epr_metrics,
    just without collapsing them to counts."""
    open_pips = [
        {'employee': str(p.employee), 'status': p.status, 'start_date': p.start_date.isoformat(),
         'approved': p.approved_at is not None}
        for p in PIPRecord.objects.filter(tl=leader).exclude(status__in=('completed', 'cancelled'))
        .select_related('employee')
    ]
    open_absences = [
        {'employee': str(a.employee), 'absence_date': a.absence_date.isoformat(), 'reason': a.reason}
        for a in Absence.objects.filter(flagged_by=leader, addressed_on__isnull=True).select_related('employee')
    ]
    pending_promotions = [
        {'employee': str(p.employee), 'nominated_on': p.nominated_on.isoformat()}
        for p in PromotionFlag.objects.filter(nominated_by=leader, status='nominated').select_related('employee')
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
    team_member_ids = user.profile.get_team_member_ids()
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
