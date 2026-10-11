"""The TL scorecard KPI rows and their status, shared by the XLSX Summary and the PDF cover.

Both report builders import from here so a number can never be green in one
file and amber in the other.
"""
from datetime import date

from .services import PROMOTION_TARGET_PCT

# Targets copied from the UI (the UI wins if they ever differ):
# - ScorecardOverview.tsx: pending leave "Target: 0".
# - TeamGovernanceSection.tsx: 1:1 "Target: 100%", reviews "Target: ≥12/year",
#   promotion "Target: {promotion.target_pct}%/year" (3.0, services.PROMOTION_TARGET_PCT),
#   PIPs pending approval (warning tone when non-zero), absences breached SLA and
#   escalations (danger tone when non-zero), both "Target: 0".
TARGETS = {
    'one_on_one_pct': 100.0,
    'reviews_per_year': 12,
    'promotion_pct': PROMOTION_TARGET_PCT,
    'pip_pending': 0,
    'absences_breached': 0,
    'escalations': 0,
}

ON_TRACK = 'On track'
WATCH = 'Watch'
OFF_TRACK = 'Off track'
NO_DATA = '—'

# A higher-is-better KPI is "Watch" from this share of its target upward.
WATCH_SHARE = 0.8


def status_for(value, target, nonzero='Off track'):
    """Status of one KPI against its target.

    ``target == 0`` means lower-is-better: 0 is on track and any breach is
    ``nonzero`` (the UI tone: a warning-level breach reads "Watch", a
    danger-level one "Off track"). Otherwise higher-is-better: at or above the
    target is on track, from ``WATCH_SHARE`` of it is watch, below is off track.
    A missing value is "—", never a status.
    """
    if value is None:
        return NO_DATA
    if target == 0:
        return ON_TRACK if value <= 0 else nonzero
    if value >= target:
        return ON_TRACK
    if value >= WATCH_SHARE * target:
        return WATCH
    return OFF_TRACK


def reviews_target(month: str | None) -> int:
    """Pro-rata review target up to ``month`` (ISO date): 12 a year is 1 a month,
    so by month M the target is M. Without a month, the full-year target."""
    if not month:
        return TARGETS['reviews_per_year']
    return TARGETS['reviews_per_year'] * date.fromisoformat(month).month // 12


def kpi_rows(scorecard, *, include_leave_overtime=True) -> list[dict]:
    """Area | Metric | Value | Target | Status rows, in display order.

    ``kind`` tells the builders how to format ``value`` and ``target``:
    ``pct`` (a percentage already multiplied by 100), ``count`` or ``num``.
    Rows without a target carry ``target=None`` and status ``—``.
    ``include_leave_overtime=False`` drops the Leave and Overtime areas for a
    viewer the leave and overtime surfaces are denied to (HBPR-only).
    """
    leave = scorecard['leave']
    meetings = scorecard['meetings']
    promotion = scorecard['promotion']
    reviews_goal = reviews_target(scorecard.get('month'))
    pip_pending = scorecard['pip']['pending_approval_count']
    breached = scorecard['absences']['breached_5_day_sla']
    escalations = scorecard['escalation_count']
    reviews = scorecard['review_deliveries_ytd']

    def row(area, metric, value, kind, target=None, target_nonzero=None):
        if target is None:
            status = NO_DATA
        else:
            status = status_for(value, target, nonzero=target_nonzero or OFF_TRACK)
        return {
            'area': area, 'metric': metric, 'value': value, 'kind': kind,
            'target': target, 'status': status,
        }

    rows = [
        row('Leave', 'Leave decided within 2 days', leave['pct_within_2_days'], 'pct'),
        row('Leave', 'Pending leave at month-end', leave['pending_at_month_end'], 'count'),
        row('Overtime', 'OT approval turnaround (days)', scorecard['overtime']['avg_turnaround_days'], 'num'),
        row('Meetings', '1:1 compliance', meetings['one_on_one_compliance_pct'], 'pct',
            TARGETS['one_on_one_pct']),
        row('Meetings', 'TL-Italy syncs', meetings['tl_sync_count'], 'count'),
        row('Meetings', 'Team meetings with HRBP', meetings['team_meetings_with_hrbp'], 'count'),
        row('Reviews', f'Management reviews (YTD, pro-rata of {TARGETS["reviews_per_year"]}/year)',
            reviews, 'count', reviews_goal),
        row('Governance', 'Open idle flags', scorecard['idle']['open_count'], 'count'),
        row('Governance', 'Absences unaddressed over 5 days', breached, 'count',
            TARGETS['absences_breached']),
        row('Governance', 'PIPs pending HR approval', pip_pending, 'count',
            TARGETS['pip_pending'], target_nonzero=WATCH),
        row('Promotion', 'Promotion ratio', promotion['promoted_pct'], 'pct',
            TARGETS['promotion_pct']),
        row('Risk', 'Escalation risks', escalations, 'count', TARGETS['escalations']),
    ]
    if include_leave_overtime:
        return rows
    return [r for r in rows if r['area'] not in ('Leave', 'Overtime')]


def format_value(value, kind) -> str:
    """Display text for a KPI value (PDF). ``None`` is a dash, never zero."""
    if value is None:
        return NO_DATA
    if kind == 'pct':
        return f'{value}%'
    if kind == 'num':
        return f'{value:g}'
    return str(value)
