"""
Compute service for TL engagement metrics.

Populates `TLApprovalMetric` snapshots. All aggregation happens here at
compute time (via `recompute_tl_metrics`); read endpoints only serve the
stored snapshot plus a freshness check.
"""
from calendar import monthrange
from datetime import timedelta

from django.utils import timezone

from apps.leave_management.models import LeaveRequest
from apps.overtime.models import OvertimeLog
from apps.standby.models import StandbyLog
from apps.users.models import Team, UserProfile

from .models import TLApprovalMetric

AGING_BUCKETS = ('<4h', '4-24h', '1-3d', '>3d')
REQUEST_TYPES = ('leave', 'overtime', 'standby')
RESUBMISSION_WINDOW_DAYS = 30
PENDING_STALE_HOURS = 48

# Per-type speed targets: leave needs a fast answer, but overtime/standby
# usually require checking timesheets/logs against another system first, so
# deciding within a week still counts as fully "good" instead of being
# graded on the same same-day scale as leave.
SPEED_TARGET_HOURS = {'leave': 4, 'overtime': 24 * 7, 'standby': 24 * 7}
SPEED_MAX_HOURS = {'leave': 72, 'overtime': 24 * 14, 'standby': 24 * 14}

_TYPE_CONFIG = {
    'leave': {'model': LeaveRequest, 'date_field': 'start_date'},
    'overtime': {'model': OvertimeLog, 'date_field': 'date'},
    'standby': {'model': StandbyLog, 'date_field': 'date'},
}


def month_bounds(month):
    """Return tz-aware (first_instant, first_instant_of_next_month) for a month."""
    first_day = month.replace(day=1)
    last_day = first_day.replace(day=monthrange(first_day.year, first_day.month)[1])
    next_month_first_day = last_day + timedelta(days=1)
    return (
        timezone.make_aware(timezone.datetime(first_day.year, first_day.month, first_day.day)),
        timezone.make_aware(timezone.datetime(
            next_month_first_day.year, next_month_first_day.month, next_month_first_day.day
        )),
    )


def weighted_mean(pairs):
    """Weighted mean of an iterable of (value, weight) pairs, rounded to 2dp.

    None values are dropped before averaging; a zero/None weight falls back
    to 1 so a single unweighted value still contributes. Returns None for an
    empty or all-None input. Shared by the `summary`/`trend` API actions and
    the Excel export builder so the composite-score and avg-TTA math can't
    drift between the three call sites.
    """
    scored = [(v, w) for v, w in pairs if v is not None]
    if not scored:
        return None
    weight_sum = sum(w for _, w in scored) or len(scored)
    return round(sum(v * (w or 1) for v, w in scored) / weight_sum, 2)


def weighted_avg_tta_hours(rows):
    """Average `avg_tta_hours` across every type's metrics in `rows`, weighted by decided count."""
    pairs = []
    for row in rows:
        for type_metrics in row.metrics.values():
            if type_metrics.get('avg_tta_hours') is not None:
                pairs.append((type_metrics['avg_tta_hours'], type_metrics.get('decided', 0) or 1))
    return weighted_mean(pairs)


def percentile(sorted_values, p):
    """Nearest-rank percentile, matching plugins.ticket_kpi.analytics."""
    n = len(sorted_values)
    if n == 0:
        return None
    idx = min(int(n * p), n - 1)
    return round(sorted_values[idx], 2)


def team_member_ids(leader, team):
    """User IDs this leader manages who belong to this specific team."""
    managed_ids = leader.profile.get_team_member_ids()
    if not managed_ids:
        return set()
    return set(
        UserProfile.objects.filter(user_id__in=managed_ids, teams=team)
        .values_list('user_id', flat=True)
    )


def leader_team_pairs():
    """Every (leader, team) pair worth a snapshot: teams with a resolvable TL."""
    pairs = []
    for team in Team.objects.select_related('team_leader').all():
        leaders = set()
        if team.team_leader_id:
            leaders.add(team.team_leader)
        for profile in UserProfile.objects.filter(teams=team).select_related('user'):
            if profile.is_team_leader:
                leaders.add(profile.user)
        for leader in leaders:
            if hasattr(leader, 'profile'):
                pairs.append((leader, team))
    return pairs


def _resubmission_count(model, date_field, member_ids, month_start, month_end):
    """Count rejections that were resubmitted (same user/date) within the window."""
    rejected = model.objects.filter(
        user_id__in=member_ids,
        status='rejected',
        submitted_at__gte=month_start,
        submitted_at__lt=month_end,
    ).values('user_id', date_field, 'submitted_at')

    count = 0
    counted_keys = set()
    for rej in rejected:
        record_date = rej[date_field]
        key = (rej['user_id'], record_date)
        if key in counted_keys:
            continue
        window_end = rej['submitted_at'] + timedelta(days=RESUBMISSION_WINDOW_DAYS)
        resubmitted = model.objects.filter(
            user_id=rej['user_id'],
            **{date_field: record_date},
            submitted_at__gt=rej['submitted_at'],
            submitted_at__lte=window_end,
        ).exclude(status='rejected').exists()
        if resubmitted:
            count += 1
            counted_keys.add(key)
    return count


def _aging_bucket(hours):
    if hours < 4:
        return '<4h'
    if hours < 24:
        return '4-24h'
    if hours < 72:
        return '1-3d'
    return '>3d'


def compute_type_metrics(type_key, member_ids, month_start, month_end):
    config = _TYPE_CONFIG[type_key]
    model = config['model']
    date_field = config['date_field']

    if not member_ids:
        submitted = decided = approved = rejected = 0
    else:
        base = model.objects.filter(
            user_id__in=member_ids,
            submitted_at__gte=month_start,
            submitted_at__lt=month_end,
        )
        submitted = base.count()
        decided_qs = base.filter(status__in=('approved', 'rejected'), approved_at__isnull=False)
        decided = decided_qs.count()
        approved = decided_qs.filter(status='approved').count()
        rejected = decided_qs.filter(status='rejected').count()

    aging = {bucket: 0 for bucket in AGING_BUCKETS}
    tta_hours = []
    if member_ids:
        for item in decided_qs.values_list('submitted_at', 'approved_at'):
            submitted_at, approved_at = item
            hours = (approved_at - submitted_at).total_seconds() / 3600
            tta_hours.append(hours)
            aging[_aging_bucket(hours)] += 1

    tta_hours.sort()
    avg_tta = round(sum(tta_hours) / len(tta_hours), 2) if tta_hours else None
    p50_tta = percentile(tta_hours, 0.50)
    p90_tta = percentile(tta_hours, 0.90)

    pending_over_48h = 0
    if member_ids:
        stale_cutoff = timezone.now() - timedelta(hours=PENDING_STALE_HOURS)
        pending_over_48h = model.objects.filter(
            user_id__in=member_ids,
            status='pending',
            submitted_at__lt=stale_cutoff,
        ).count()

    resubmissions = _resubmission_count(model, date_field, member_ids, month_start, month_end) if member_ids else 0

    return {
        'submitted': submitted,
        'decided': decided,
        'approved': approved,
        'rejected': rejected,
        'avg_tta_hours': avg_tta,
        'p50_tta_hours': p50_tta,
        'p90_tta_hours': p90_tta,
        'aging': aging,
        'pending_over_48h': pending_over_48h,
        'resubmission_count': resubmissions,
    }, tta_hours


def _type_speed_score(type_key, p90_hours):
    """0-100 speed score for one request type, against that type's own target/ceiling."""
    if p90_hours is None:
        return None
    # Fall back to leave's stricter same-day target for any future request
    # type that hasn't been given its own entry yet.
    target = SPEED_TARGET_HOURS.get(type_key, SPEED_TARGET_HOURS['leave'])
    ceiling = SPEED_MAX_HOURS.get(type_key, SPEED_MAX_HOURS['leave'])
    if p90_hours <= target:
        return 100.0
    if p90_hours >= ceiling:
        return 0.0
    return 100 - ((p90_hours - target) / (ceiling - target)) * 100


def compute_engagement_score(type_metrics, all_tta_hours, team_size, active_submitters):
    """0-100 composite: speed 40% + approval rate 20% + activity 20% + consistency 20%."""
    total_decided = sum(m['decided'] for m in type_metrics.values())
    total_approved = sum(m['approved'] for m in type_metrics.values())

    speed_score = weighted_mean(
        (_type_speed_score(type_key, m['p90_tta_hours']), m['decided'])
        for type_key, m in type_metrics.items()
        if m['p90_tta_hours'] is not None
    )

    approval_score = round((total_approved / total_decided) * 100, 2) if total_decided else None
    activity_score = round((active_submitters / team_size) * 100, 2) if team_size else None

    consistency_score = None
    if len(all_tta_hours) >= 2:
        mean = sum(all_tta_hours) / len(all_tta_hours)
        if mean > 0:
            variance = sum((x - mean) ** 2 for x in all_tta_hours) / len(all_tta_hours)
            std_dev = variance ** 0.5
            consistency_score = round(max(0.0, 1 - std_dev / mean) * 100, 2)
        else:
            consistency_score = 100.0

    components = [speed_score, approval_score, activity_score, consistency_score]
    weights = [0.4, 0.2, 0.2, 0.2]
    known = [(c, w) for c, w in zip(components, weights) if c is not None]
    if not known:
        engagement_score = None
    else:
        weight_sum = sum(w for _, w in known)
        engagement_score = round(sum(c * w for c, w in known) / weight_sum, 2)

    return engagement_score, {
        'score_speed': speed_score,
        'score_approval_rate': approval_score,
        'score_activity': activity_score,
        'score_consistency': consistency_score,
    }


def _decisions_during_leave(leader, member_ids, month_start, month_end):
    """Count team-member requests this leader decided while on their own approved leave.

    Leave periods are clipped to this snapshot's own month before matching
    decisions, so a leave spanning a month boundary is credited to each
    month only for the slice of the leave that actually falls in it —
    otherwise both months' snapshots would independently match the same
    decisions from the shared, un-clipped leave range and double-count them.
    The decided-items query is also bounded to the clipped leave window
    instead of scanning the leader's full decision history on every
    monthly recompute.
    """
    if not member_ids:
        return 0

    month_start_date = month_start.date()
    month_end_date = month_end.date()  # exclusive (first day of next month)

    leave_periods = list(
        LeaveRequest.objects.filter(user=leader, status='approved')
        .filter(start_date__lt=month_end_date, end_date__gte=month_start_date)
        .values_list('start_date', 'end_date')
    )
    if not leave_periods:
        return 0

    clipped_periods = [
        (max(start, month_start_date), min(end, month_end_date - timedelta(days=1)))
        for start, end in leave_periods
    ]
    decided_start = min(start for start, _ in clipped_periods)
    decided_end = max(end for _, end in clipped_periods)

    counted = set()
    for type_key in REQUEST_TYPES:
        model = _TYPE_CONFIG[type_key]['model']
        decided = model.objects.filter(
            user_id__in=member_ids,
            approved_by=leader,
            status__in=('approved', 'rejected'),
            approved_at__date__gte=decided_start,
            approved_at__date__lte=decided_end,
        ).values_list('id', 'approved_at')
        for obj_id, approved_at in decided:
            decided_date = approved_at.date()
            if any(start <= decided_date <= end for start, end in clipped_periods):
                counted.add((type_key, obj_id))
    return len(counted)


def compute_tl_metric(leader, team, month):
    """Compute (or refresh) one (leader, team, month) snapshot. Idempotent."""
    month_start, month_end = month_bounds(month)
    member_ids = team_member_ids(leader, team)
    team_size = len(member_ids)

    metrics = {}
    all_tta_hours = []
    active_submitter_ids = set()
    total_resubmissions = 0
    for type_key in REQUEST_TYPES:
        type_metrics, tta_hours = compute_type_metrics(type_key, member_ids, month_start, month_end)
        metrics[type_key] = type_metrics
        all_tta_hours.extend(tta_hours)
        total_resubmissions += type_metrics['resubmission_count']
        if type_metrics['submitted']:
            config = _TYPE_CONFIG[type_key]
            active_submitter_ids |= set(
                config['model'].objects.filter(
                    user_id__in=member_ids,
                    submitted_at__gte=month_start,
                    submitted_at__lt=month_end,
                ).values_list('user_id', flat=True)
            )

    active_submitters = len(active_submitter_ids)
    total_decided = sum(m['decided'] for m in metrics.values())
    total_approved = sum(m['approved'] for m in metrics.values())
    approval_rate_pct = round((total_approved / total_decided) * 100, 2) if total_decided else None

    engagement_score, sub_scores = compute_engagement_score(
        metrics, all_tta_hours, team_size, active_submitters
    )
    decisions_during_leave = _decisions_during_leave(leader, member_ids, month_start, month_end)

    snapshot, _ = TLApprovalMetric.objects.update_or_create(
        leader=leader,
        team=team,
        month=month_start,
        defaults={
            'metrics': metrics,
            'team_size': team_size,
            'active_submitters': active_submitters,
            'approval_rate_pct': approval_rate_pct,
            'resubmission_count': total_resubmissions,
            'engagement_score': engagement_score,
            'decisions_during_leave': decisions_during_leave,
            'computed_at': timezone.now(),
            **sub_scores,
        },
    )
    return snapshot


def is_stale(snapshot):
    """True if any domain record for this leader/team was touched after computed_at."""
    if not snapshot.computed_at:
        return True
    member_ids = team_member_ids(snapshot.leader, snapshot.team)
    if len(member_ids) != snapshot.team_size:
        return True
    if not member_ids:
        return False
    for type_key in REQUEST_TYPES:
        model = _TYPE_CONFIG[type_key]['model']
        if model.objects.filter(user_id__in=member_ids, updated_at__gt=snapshot.computed_at).exists():
            return True
    return False
