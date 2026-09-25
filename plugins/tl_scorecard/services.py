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

from .models import IdleFlag, Meeting, ReviewDelivery

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
        "sheet": 2, "status": "planned", "phase": 3,
        "note": "Needs a new Absence model, distinct from LeaveRequest (which is pre-approved by definition).",
    },
    {
        "kpi": "0 escalations from administrative delays/communication failures",
        "sheet": 1, "status": "planned", "phase": 3,
        "note": "Needs an escalation/incident log.",
    },
    {
        "kpi": "HR Albania formal communications correctly routed/documented",
        "sheet": 1, "status": "planned", "phase": 3,
        "note": "Needs HR to define the taxonomy of formal-communication types first.",
    },
    {
        "kpi": "100% timely EPR completion (3 stages, ≥5 goals/member)",
        "sheet": 2, "status": "planned", "phase": 3,
        "note": "Large domain, own plan.",
    },
    {
        "kpi": "PIPs executed only with prior HR approval, evidence-based",
        "sheet": 2, "status": "planned", "phase": 3,
        "note": "HR-approval-gated workflow, own plan.",
    },
    {
        "kpi": "100% onboarding sign-offs before start date",
        "sheet": 2, "status": "planned", "phase": 3,
        "note": "Onboarding plugin is currently pure file storage — needs a plan/checklist + approval state.",
    },
    {
        "kpi": "High-potential members identified for promotion (3%/year)",
        "sheet": 1, "status": "planned", "phase": 3,
        "note": "Needs a promotion/high-potential event model, own plan.",
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
    held_with_hrbp = sum(1 for m in team_meetings if m.attendees.filter(role='hrbp').exists())
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
    }
