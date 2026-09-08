"""
Automated insights engine for the Analytics plugin.

Analyzes filtered OT/standby/leave data and generates natural-language
deductions — trend changes, anomalies, concentration risks, backlog
alerts, and daily spikes. Each insight is a structured object the
frontend renders as a colored card.

Insight types:
  - trend_up / trend_down: period-over-period change > trend_threshold
  - concentration: one user/team accounts for > concentration_threshold of total
  - backlog: pending requests awaiting action (>= backlog_threshold)
  - spike: a single day has > spike_threshold x the daily average
  - status_bottleneck: > status_bottleneck_threshold of records are pending

Thresholds are configurable via AnalyticsConfiguration model fields.
"""
from datetime import timedelta
from django.db.models import Sum, Count, Q

from apps.overtime.models import OvertimeLog
from apps.standby.models import StandbyLog
from apps.leave_management.models import LeaveRequest
from .models import AnalyticsConfiguration


# Default thresholds (used when no AnalyticsConfiguration exists)
DEFAULT_THRESHOLDS = {
    'trend': 0.15,
    'concentration': 0.40,
    'spike': 2.0,
    'backlog': 5,
    'status_bottleneck': 0.30,
}


def _get_thresholds():
    """Load thresholds from AnalyticsConfiguration, falling back to defaults.

    Cached for 60 seconds via Django's cache framework to avoid a DB
    query on every insights call. Falls back to uncached DB query if
    the cache is unavailable.
    """
    from django.core.cache import cache
    cache_key = 'analytics_insight_thresholds'
    try:
        cached = cache.get(cache_key)
        if cached is not None:
            return cached
    except Exception:
        pass  # Cache unavailable — proceed to DB query

    try:
        config = AnalyticsConfiguration.objects.first()
        if config:
            thresholds = {
                'trend': config.trend_threshold,
                'concentration': config.concentration_threshold,
                'spike': config.spike_threshold,
                'backlog': config.backlog_threshold,
                'status_bottleneck': config.status_bottleneck_threshold,
            }
            try:
                cache.set(cache_key, thresholds, 60)
            except Exception:
                pass
            return thresholds
    except Exception:
        pass
    return DEFAULT_THRESHOLDS.copy()


def _pct_change(current, previous):
    """Safe percentage change. Returns 0 if previous is 0."""
    if previous == 0:
        return 0.0
    return (current - previous) / previous


def _safe_div(numerator, denominator):
    """Safe division. Returns 0 if denominator is 0."""
    if denominator == 0:
        return 0.0
    return numerator / denominator


def generate_insights(start_date, end_date, leave_filters, overtime_filters,
                      standby_filters, categories,
                      team_user_ids=None, users=None, statuses=None):
    """
    Generate automated insights from the filtered data.

    Returns a list of insight dicts, each with:
      type, severity, title, description, metric, change

    The team_user_ids, users, and statuses params are used to build
    previous-period Q objects with the same non-date filters as the current
    period, so trend comparisons are apples-to-apples.
    """
    insights = []
    period_length = (end_date - start_date).days + 1
    prev_start = start_date - timedelta(days=period_length)
    prev_end = start_date - timedelta(days=1)

    # Load configurable thresholds
    thresholds = _get_thresholds()

    include_ot = not categories or 'overtime' in categories
    include_sb = not categories or 'standby' in categories
    include_leave = not categories or 'leave' in categories

    # Build previous-period Q objects with the same non-date filters
    prev_ot_filters = Q(date__gte=prev_start.date(), date__lte=prev_end.date())
    prev_sb_filters = Q(date__gte=prev_start.date(), date__lte=prev_end.date())
    prev_leave_filters = Q(created_at__gte=prev_start, created_at__lt=start_date)
    if team_user_ids:
        prev_ot_filters &= Q(user_id__in=team_user_ids)
        prev_sb_filters &= Q(user_id__in=team_user_ids)
        prev_leave_filters &= Q(user_id__in=team_user_ids)
    if users:
        prev_ot_filters &= Q(user_id__in=users)
        prev_sb_filters &= Q(user_id__in=users)
        prev_leave_filters &= Q(user_id__in=users)
    if statuses:
        prev_ot_filters &= Q(status__in=statuses)
        prev_sb_filters &= Q(status__in=statuses)
        prev_leave_filters &= Q(status__in=statuses)

    # ── 1. Trend insights (period-over-period) ──────────────────────
    if include_ot:
        current_ot = float(
            OvertimeLog.objects.filter(overtime_filters).aggregate(
                total=Sum('hours')
            )['total'] or 0
        )
        prev_ot = float(
            OvertimeLog.objects.filter(prev_ot_filters).aggregate(
                total=Sum('hours')
            )['total'] or 0
        )
        change = _pct_change(current_ot, prev_ot)
        if abs(change) >= thresholds['trend'] and current_ot > 0:
            direction = 'up' if change > 0 else 'down'
            severity = 'warning' if change > 0 else 'info'
            insights.append({
                'type': f'trend_{direction}',
                'severity': severity,
                'title': f'Overtime hours {direction} {abs(change * 100):.0f}%',
                'description': (
                    f'Overtime totaled {current_ot:.1f}h this period vs '
                    f'{prev_ot:.1f}h in the previous {period_length} days. '
                    f'{"Increase" if change > 0 else "Decrease"} of '
                    f'{abs(change * 100):.0f}%.'
                ),
                'metric': 'Overtime Hours',
                'change': round(change * 100, 1),
            })

    if include_sb:
        current_sb = float(
            StandbyLog.objects.filter(standby_filters).aggregate(
                total=Sum('hours')
            )['total'] or 0
        )
        prev_sb = float(
            StandbyLog.objects.filter(prev_sb_filters).aggregate(
                total=Sum('hours')
            )['total'] or 0
        )
        change = _pct_change(current_sb, prev_sb)
        if abs(change) >= thresholds['trend'] and current_sb > 0:
            direction = 'up' if change > 0 else 'down'
            severity = 'warning' if change > 0 else 'info'
            insights.append({
                'type': f'trend_{direction}',
                'severity': severity,
                'title': f'Standby hours {direction} {abs(change * 100):.0f}%',
                'description': (
                    f'Standby totaled {current_sb:.1f}h this period vs '
                    f'{prev_sb:.1f}h in the previous {period_length} days. '
                    f'{"Increase" if change > 0 else "Decrease"} of '
                    f'{abs(change * 100):.0f}%.'
                ),
                'metric': 'Standby Hours',
                'change': round(change * 100, 1),
            })

    if include_leave:
        current_leave = LeaveRequest.objects.filter(leave_filters).count()
        prev_leave = LeaveRequest.objects.filter(prev_leave_filters).count()
        change = _pct_change(current_leave, prev_leave)
        if abs(change) >= thresholds['trend'] and current_leave > 0:
            direction = 'up' if change > 0 else 'down'
            severity = 'info'
            insights.append({
                'type': f'trend_{direction}',
                'severity': severity,
                'title': f'Leave requests {direction} {abs(change * 100):.0f}%',
                'description': (
                    f'{current_leave} leave requests this period vs '
                    f'{prev_leave} in the previous {period_length} days.'
                ),
                'metric': 'Leave Requests',
                'change': round(change * 100, 1),
            })

    # ── 2. User concentration (burnout risk) ───────────────────────
    if include_ot:
        ot_by_user = list(
            OvertimeLog.objects.filter(overtime_filters)
            .values('user__username', 'user__first_name', 'user__last_name')
            .annotate(total_hours=Sum('hours'))
            .order_by('-total_hours')
        )
        total_ot = sum(float(u['total_hours'] or 0) for u in ot_by_user)
        if total_ot > 0 and ot_by_user:
            top_user = ot_by_user[0]
            top_hours = float(top_user['total_hours'] or 0)
            share = _safe_div(top_hours, total_ot)
            if share >= thresholds['concentration'] and len(ot_by_user) > 1:
                name = (
                    f"{top_user['user__first_name']} {top_user['user__last_name']}".strip()
                    or top_user['user__username']
                )
                insights.append({
                    'type': 'concentration',
                    'severity': 'warning',
                    'title': f'{name} accounts for {share * 100:.0f}% of overtime',
                    'description': (
                        f'{name} logged {top_hours:.1f}h out of {total_ot:.1f}h total '
                        f'({share * 100:.0f}%) — potential burnout risk or uneven workload distribution.'
                    ),
                    'metric': 'Overtime Concentration',
                    'change': round(share * 100, 1),
                })

    # ── 3. Backlog alerts (pending items) ──────────────────────────
    if include_leave:
        pending_leave = LeaveRequest.objects.filter(
            leave_filters, status='pending'
        ).count()
        if pending_leave >= thresholds['backlog']:
            insights.append({
                'type': 'backlog',
                'severity': 'warning',
                'title': f'{pending_leave} leave requests pending approval',
                'description': (
                    f'{pending_leave} leave requests are awaiting approval. '
                    f'Delayed approvals can impact team planning and coverage.'
                ),
                'metric': 'Pending Leave',
                'change': 0,
            })

    if include_ot:
        pending_ot = OvertimeLog.objects.filter(
            overtime_filters, status='pending'
        ).count()
        if pending_ot >= thresholds['backlog']:
            insights.append({
                'type': 'backlog',
                'severity': 'warning',
                'title': f'{pending_ot} overtime requests pending approval',
                'description': (
                    f'{pending_ot} overtime requests are awaiting approval. '
                    f'Consider batch-reviewing to reduce the approval bottleneck.'
                ),
                'metric': 'Pending Overtime',
                'change': 0,
            })

    # ── 4. Daily spike detection ───────────────────────────────────
    if include_ot:
        ot_by_day = list(
            OvertimeLog.objects.filter(overtime_filters)
            .values('date')
            .annotate(hours=Sum('hours'))
            .order_by('date')
        )
        if len(ot_by_day) >= 3:
            daily_hours = [float(d['hours'] or 0) for d in ot_by_day]
            avg_hours = sum(daily_hours) / len(daily_hours)
            for day_data in ot_by_day:
                day_hours = float(day_data['hours'] or 0)
                if day_hours >= avg_hours * thresholds['spike'] and avg_hours > 0:
                    insights.append({
                        'type': 'spike',
                        'severity': 'info',
                        'title': f'Overtime spike on {day_data["date"].isoformat()}',
                        'description': (
                            f'{day_hours:.1f}h logged on {day_data["date"].isoformat()} — '
                            f'{day_hours / avg_hours:.1f}x the daily average of {avg_hours:.1f}h.'
                        ),
                        'metric': 'Overtime Spike',
                        'change': round((day_hours / avg_hours - 1) * 100, 1),
                    })
                    break  # only report the first spike

    # ── 5. Status bottleneck ───────────────────────────────────────
    if include_ot:
        ot_status_counts = OvertimeLog.objects.filter(overtime_filters).aggregate(
            total=Count('id'),
            pending=Count('id', filter=Q(status='pending')),
        )
        total_ot_records = ot_status_counts['total'] or 0
        pending_ot_records = ot_status_counts['pending'] or 0
        if total_ot_records > 0:
            pending_ratio = _safe_div(pending_ot_records, total_ot_records)
            if pending_ratio >= thresholds['status_bottleneck']:
                insights.append({
                    'type': 'status_bottleneck',
                    'severity': 'warning',
                    'title': f'{pending_ratio * 100:.0f}% of overtime requests are pending',
                    'description': (
                        f'{pending_ot_records} of {total_ot_records} overtime requests '
                        f'are pending approval. The approval rate is '
                        f'{(1 - pending_ratio) * 100:.0f}%.'
                    ),
                    'metric': 'Approval Bottleneck',
                    'change': round(pending_ratio * 100, 1),
                })

    return insights
