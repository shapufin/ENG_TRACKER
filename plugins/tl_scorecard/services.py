"""
Phase 1 computation layer for the TL Scorecard plugin — pure functions over
existing `apps/*` data. No models of its own; nothing here writes to the DB.

Deliberately never imports `plugins.engagement` or `plugins.skills` — see
the plugin-isolation architecture rule in the approved plan. Anything from
those plugins is composed in the frontend against their own existing APIs.
"""
from __future__ import annotations

from datetime import date

from apps.leave_management.models import LeaveRequest, count_business_days
from apps.overtime.models.core import OvertimeLog

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
        "sheet": 1, "status": "approximate", "phase": 1,
        "note": (
            "The existing engagement plugin score measures TL approval-request "
            "speed/consistency, not employee sentiment. Shown for reference, "
            "labeled accordingly. The real sentiment/pulse-survey score is Phase 2."
        ),
    },
    {
        "kpi": "Certification achievement via Skills Matrix",
        "sheet": 1, "status": "planned", "phase": 2,
        "note": "Skills Matrix has no certification field yet — small addition to the skills plugin, Phase 2.",
    },
    {
        "kpi": "Balanced junior/senior workforce ratio",
        "sheet": 1, "status": "planned", "phase": 2,
        "note": "Needs a seniority field on UserProfile (apps/users, a core app) — Phase 2.",
    },
    {
        "kpi": "1-on-1 compliance (≥1/member/month)",
        "sheet": 1, "status": "planned", "phase": 2,
        "note": "Needs a Meeting model.",
    },
    {
        "kpi": "≥45 documented Technical Lead syncs",
        "sheet": 1, "status": "planned", "phase": 2,
        "note": "Same Meeting model, meeting_type=tl_sync.",
    },
    {
        "kpi": "Monthly team meetings with HRBP, notes within 24h",
        "sheet": 2, "status": "planned", "phase": 2,
        "note": "Same Meeting model, meeting_type=team_meeting, attendee roles.",
    },
    {
        "kpi": "Idle risks flagged with weekly status reporting",
        "sheet": 2, "status": "planned", "phase": 2,
        "note": "Needs an IdleFlag model plus a recurring weekly-status child log.",
    },
    {
        "kpi": "≥12 monthly management reviews to Ops/GM",
        "sheet": 2, "status": "planned", "phase": 2,
        "note": "Needs a lightweight ReviewDelivery event log.",
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


def build_scorecard(user, month: date) -> dict:
    """Full Phase 1 scorecard for one TL (`user`) for `month`."""
    team_member_ids = user.profile.get_team_member_ids()
    month = reporting_period(month)
    return {
        'month': month.isoformat(),
        'team_size': len(team_member_ids),
        'leave': leave_sla_metrics(team_member_ids, month),
        'overtime': ot_turnaround_metrics(team_member_ids, month),
    }
