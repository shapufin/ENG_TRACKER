"""
Compute service for TL engagement metrics.

Populates `TLApprovalMetric` snapshots, one row per (leader, team, month).
A request belongs to the month it was submitted in. Each request is judged
against its SLA deadline (see `sla.py`): decided within the deadline is
on time, decided later or still pending past the deadline is a breach.
Read endpoints only serve the stored snapshot plus a freshness check.
"""
from calendar import monthrange
from collections import defaultdict
from datetime import datetime, time, timedelta
import statistics

from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.db.models.functions import TruncMonth
from django.utils import timezone

from apps.dashboard.models.calendar import PublicHoliday, UserCalendarPreference
from apps.leave_management.models import LeaveRequest
from apps.overtime.models import OvertimeLog
from apps.standby.models import StandbyLog
from apps.users.models import Team, TeamMembership, UserProfile

from .models import TLApprovalMetric
from .sla import TIRANA, deadline_for, responsiveness_score, today_local

AGING_BUCKETS = ('<4h', '4-24h', '1-3d', '>3d')
REQUEST_TYPES = ('leave', 'overtime', 'standby')
RESUBMISSION_WINDOW_DAYS = 30
HOLIDAY_WINDOW_DAYS = 14
SLA_METRIC_KEYS = ('judgeable', 'on_time', 'breaches', 'pending_past_deadline', 'median_fraction')
COMPONENT_WEIGHTS = {'speed': 0.4, 'approval': 0.2, 'responsiveness': 0.2, 'consistency': 0.2}

_TYPE_CONFIG = {
    'leave': {'model': LeaveRequest, 'date_field': 'start_date'},
    'overtime': {'model': OvertimeLog, 'date_field': 'date'},
    'standby': {'model': StandbyLog, 'date_field': 'date'},
}


def _now():
    """Single clock for freshness, deadlines and computed_at (patched in tests)."""
    return timezone.now()


def _local_midnight(day):
    return datetime.combine(day, time.min, tzinfo=TIRANA)


def month_bounds(month):
    """Return Tirana-local (first_instant, first_instant_of_next_month) for a month."""
    first_day = month.replace(day=1)
    next_month_first = first_day + timedelta(days=monthrange(first_day.year, first_day.month)[1])
    return _local_midnight(first_day), _local_midnight(next_month_first)


def weighted_mean(pairs):
    """Weighted mean of an iterable of (value, weight) pairs, rounded to 2dp.

    None values are dropped before averaging; a zero/None weight falls back
    to 1 so a single unweighted value still contributes. Returns None for an
    empty or all-None input.
    """
    scored = [(v, w or 1) for v, w in pairs if v is not None]
    if not scored:
        return None
    weight_sum = sum(w for _, w in scored)
    return round(sum(v * w for v, w in scored) / weight_sum, 2)


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


def _managed_map(leader_ids):
    """{leader_id: active user ids the leader manages}, in a fixed number of queries.

    A leader manages: FK-assigned staff (`italian_tl`/`albanian_tl`), members of
    the teams they belong to, and members of the teams they lead. Soft-deleted
    memberships are ignored everywhere. The leader is excluded: their own
    requests are decided by someone else. This is the only definition of
    scope in this plugin; per-leader callers must go through it too.
    """
    leader_ids = set(leader_ids)
    managed = {lid: set() for lid in leader_ids}
    if not leader_ids:
        return managed

    leader_teams = defaultdict(set)
    for user_id, team_id in TeamMembership.objects.filter(
        is_deleted=False, user_profile__user_id__in=leader_ids
    ).values_list('user_profile__user_id', 'team_id'):
        leader_teams[user_id].add(team_id)
    for leader_id, team_id in Team.objects.filter(is_deleted=False, team_leader_id__in=leader_ids).values_list('team_leader_id', 'id'):
        leader_teams[leader_id].add(team_id)

    team_members = _team_members({t for teams in leader_teams.values() for t in teams})
    for leader_id in leader_ids:
        for team_id in leader_teams.get(leader_id, ()):
            managed[leader_id] |= team_members[team_id]

    for user_id, italian, albanian in UserProfile.objects.filter(
        Q(italian_tl__in=leader_ids) | Q(albanian_tl__in=leader_ids)
    ).values_list('user_id', 'italian_tl_id', 'albanian_tl_id'):
        for leader_id in (italian, albanian):
            if leader_id in managed:
                managed[leader_id].add(user_id)

    everyone = set().union(*managed.values())
    active = set(User.objects.filter(id__in=everyone, is_active=True).values_list('id', flat=True))
    return {lid: (members & active) - {lid} for lid, members in managed.items()}


def _team_members(team_ids):
    """{team_id: user ids with a live membership}, one query."""
    members = defaultdict(set)
    if team_ids:
        for user_id, team_id in TeamMembership.objects.filter(
            is_deleted=False, team_id__in=team_ids
        ).values_list('user_profile__user_id', 'team_id'):
            members[team_id].add(user_id)
    return members


class ReadScope:
    """Scope and membership memo for one request.

    Nothing writes membership during a read, so one instance is safe for the
    whole request. Create one per request (the viewset does); functions accept
    ``scope=None`` and create a throwaway one, so existing callers are unchanged.
    """

    def __init__(self):
        self._managed = {}
        self._team_members = {}

    def managed(self, leader_ids):
        missing = set(leader_ids) - self._managed.keys()
        if missing:
            self._managed.update(_managed_map(missing))
        return {lid: self._managed[lid] for lid in leader_ids}

    def team_members(self, team_ids):
        missing = set(team_ids) - self._team_members.keys()
        if missing:
            members = _team_members(missing)
            self._team_members.update({tid: members[tid] for tid in missing})
        return {tid: self._team_members[tid] for tid in team_ids}


def _scope(scope):
    return ReadScope() if scope is None else scope


def team_member_ids(leader, team, scope=None):
    """Managed users who belong to this team. Staff in several teams count in each."""
    scope = _scope(scope)
    return scope.managed([leader.id])[leader.id] & scope.team_members([team.id])[team.id]


def member_sets_for(rows, scope=None):
    """{(leader_id, team_id): member ids} for snapshot rows, in a fixed number of queries."""
    scope = _scope(scope)
    managed = scope.managed({r.leader_id for r in rows})
    members = scope.team_members({r.team_id for r in rows})
    return {(r.leader_id, r.team_id): managed.get(r.leader_id, set()) & members[r.team_id] for r in rows}


TL_ROLE_CODES = ('italian_tl', 'albanian_tl')


def candidate_leader_ids():
    """Users who may manage staff: team leaders, FK targets, and TL-role holders.

    Filtered in SQL. `UserRole` is authoritative; `UserProfile.role_codes` is a
    cache of it, so it is not scanned. Legacy flags are still honoured.
    """
    return set(
        User.objects.filter(
            Q(led_teams__isnull=False)
            | Q(italian_team_members__isnull=False)
            | Q(albanian_team_members__isnull=False)
            | Q(profile__is_italian_tl_role=True)
            | Q(profile__is_albanian_tl_role=True)
            | Q(user_roles__is_active=True, user_roles__is_deleted=False, user_roles__role__code__in=TL_ROLE_CODES)
        ).values_list('id', flat=True).distinct()
    )


def leader_team_pairs(leader_ids=None, scope=None):
    """(leader, team) pairs worth a snapshot: teams the leader leads, plus every
    team that contains at least one managed user. Fixed number of queries."""
    ids = candidate_leader_ids() if leader_ids is None else set(leader_ids)
    leaders = {
        u.id: u for u in User.objects.filter(id__in=ids, is_active=True).select_related('profile')
        if hasattr(u, 'profile')
    }
    managed = _scope(scope).managed(leaders)
    everyone_managed = set().union(*managed.values())
    member_teams = defaultdict(set)
    for user_id, team_id in TeamMembership.objects.filter(
        is_deleted=False, user_profile__user_id__in=everyone_managed
    ).values_list('user_profile__user_id', 'team_id'):
        member_teams[user_id].add(team_id)
    led = defaultdict(set)
    for leader_id, team_id in Team.objects.filter(is_deleted=False, team_leader_id__in=leaders).values_list('team_leader_id', 'id'):
        led[leader_id].add(team_id)

    team_ids = set()
    team_sets = {}
    for leader_id in leaders:
        team_sets[leader_id] = set(led[leader_id]) | {t for m in managed[leader_id] for t in member_teams[m]}
        team_ids |= team_sets[leader_id]
    teams = {t.id: t for t in Team.objects.filter(is_deleted=False, id__in=team_ids)}
    return [(leaders[lid], teams[tid]) for lid in sorted(leaders) for tid in sorted(team_sets[lid]) if tid in teams]


def ensure_current_month_snapshots(leader_ids=None, scope=None):
    """Create this month's snapshot for every (leader, team) pair that has none.

    Existing rows are never touched here; staleness is handled on read.
    Runs on every TL read, so a team that appears mid-month gets its row on the
    next read without waiting for a recompute.
    """
    scope = _scope(scope)
    month = today_local().replace(day=1)
    pairs = leader_team_pairs(leader_ids, scope)
    scope.team_members({team.id for _, team in pairs})  # one query for every team about to be computed
    have = set(TLApprovalMetric.objects.filter(month=month).values_list('leader_id', 'team_id'))
    for leader, team in pairs:
        if (leader.id, team.id) in have:
            continue
        try:
            with transaction.atomic():  # savepoint: keep the request's transaction usable
                compute_tl_metric(leader, team, month, scope)
        except IntegrityError:  # a concurrent read created the same row
            pass


def holiday_dates_for(leader, window_start, window_end):
    """Public-holiday dates the leader's deadlines skip: global holidays plus
    holidays of calendars the leader has active."""
    calendar_ids = list(
        UserCalendarPreference.objects.filter(user=leader, is_active=True, is_deleted=False)
        .values_list('calendar_id', flat=True)
    )
    return set(
        PublicHoliday.objects.filter(is_deleted=False, date__gte=window_start, date__lte=window_end)
        .filter(Q(calendar__isnull=True) | Q(calendar_id__in=calendar_ids))
        .values_list('date', flat=True)
    )


def _resubmission_count(model, date_field, member_ids, month_start, month_end):
    """Count rejections that were resubmitted (same user/date) within the window."""
    rejected = list(model.objects.filter(
        user_id__in=member_ids,
        status='rejected',
        submitted_at__gte=month_start,
        submitted_at__lt=month_end,
        is_deleted=False,
    ).values('user_id', date_field, 'submitted_at'))

    if not rejected:
        return 0

    latest_window_end = max(r['submitted_at'] for r in rejected) + timedelta(days=RESUBMISSION_WINDOW_DAYS)
    candidates = model.objects.filter(
        user_id__in={r['user_id'] for r in rejected},
        submitted_at__gt=min(r['submitted_at'] for r in rejected),
        submitted_at__lte=latest_window_end,
        is_deleted=False,
    ).exclude(status='rejected').values('user_id', date_field, 'submitted_at')

    candidates_by_key = {}
    for c in candidates:
        candidates_by_key.setdefault((c['user_id'], c[date_field]), []).append(c['submitted_at'])

    count = 0
    counted_keys = set()
    for rej in rejected:
        key = (rej['user_id'], rej[date_field])
        if key in counted_keys:
            continue
        window_end = rej['submitted_at'] + timedelta(days=RESUBMISSION_WINDOW_DAYS)
        if any(rej['submitted_at'] < t <= window_end for t in candidates_by_key.get(key, [])):
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


def _empty_type_metrics():
    return {
        'submitted': 0, 'decided': 0, 'approved': 0, 'rejected': 0,
        'judgeable': 0, 'on_time': 0, 'breaches': 0, 'pending_past_deadline': 0,
        'avg_tta_hours': None, 'p50_tta_hours': None, 'p90_tta_hours': None,
        'median_fraction': None,
        'aging': {bucket: 0 for bucket in AGING_BUCKETS},
        'resubmission_count': 0,
    }


def compute_type_metrics(type_key, member_ids, month_start, month_end, holidays, now):
    """Judge every request of one type submitted in the month against its SLA.

    Returns (metrics, deadline_fractions, next_pending_deadline, submitter_ids).
    `deadline_fractions` holds, per decided request, the share of its deadline
    window that was used (0 = instant, 1 = at the deadline).
    """
    if not member_ids:
        return _empty_type_metrics(), [], None, set()

    model = _TYPE_CONFIG[type_key]['model']
    date_field = _TYPE_CONFIG[type_key]['date_field']
    rows = list(
        model.objects.filter(
            user_id__in=member_ids,
            submitted_at__gte=month_start,
            submitted_at__lt=month_end,
            is_deleted=False,
        ).values_list('user_id', 'status', 'submitted_at', 'approved_at')
    )

    metrics = _empty_type_metrics()
    fractions, tta_hours, submitters = [], [], set()
    next_deadline = None
    for user_id, status, submitted_at, approved_at in rows:
        submitters.add(user_id)
        deadline = deadline_for(type_key, submitted_at, holidays)
        if status in ('approved', 'rejected') and approved_at is not None:
            elapsed = max((approved_at - submitted_at).total_seconds(), 0)
            hours = elapsed / 3600
            metrics['decided'] += 1
            metrics['approved'] += int(status == 'approved')
            metrics['rejected'] += int(status == 'rejected')
            metrics['aging'][_aging_bucket(hours)] += 1
            tta_hours.append(hours)
            fractions.append(elapsed / max((deadline - submitted_at).total_seconds(), 1))
            metrics['judgeable'] += 1
            metrics['on_time'] += int(approved_at <= deadline)
        elif status == 'pending':
            if now > deadline:
                metrics['judgeable'] += 1
                metrics['pending_past_deadline'] += 1
            elif next_deadline is None or deadline < next_deadline:
                next_deadline = deadline

    tta_hours.sort()
    metrics['submitted'] = len(rows)
    metrics['breaches'] = metrics['judgeable'] - metrics['on_time']
    metrics['avg_tta_hours'] = round(sum(tta_hours) / len(tta_hours), 2) if tta_hours else None
    metrics['p50_tta_hours'] = percentile(tta_hours, 0.50)
    metrics['p90_tta_hours'] = percentile(tta_hours, 0.90)
    metrics['median_fraction'] = round(statistics.median(fractions), 4) if fractions else None
    metrics['resubmission_count'] = _resubmission_count(model, date_field, member_ids, month_start, month_end)
    return metrics, fractions, next_deadline, submitters


def compute_engagement_score(type_metrics, all_fractions):
    """0-100 composite: within-SLA 40% + approval rate 20% + responsiveness 20% + consistency 20%.

    Weights of components with no data are dropped and the rest renormalised.
    """
    judgeable = sum(m['judgeable'] for m in type_metrics.values())
    on_time = sum(m['on_time'] for m in type_metrics.values())
    total_decided = sum(m['decided'] for m in type_metrics.values())
    total_approved = sum(m['approved'] for m in type_metrics.values())

    speed = round(on_time / judgeable * 100, 2) if judgeable else None
    approval = round(total_approved / total_decided * 100, 2) if total_decided else None
    responsiveness = weighted_mean(
        (responsiveness_score(m['median_fraction']), m['decided'])
        for m in type_metrics.values()
        if m['median_fraction'] is not None
    )

    consistency = None
    if len(all_fractions) >= 2:
        mean = sum(all_fractions) / len(all_fractions)
        if mean > 0:
            variance = sum((x - mean) ** 2 for x in all_fractions) / len(all_fractions)
            consistency = round(max(0.0, 1 - (variance ** 0.5) / mean) * 100, 2)
        else:
            consistency = 100.0

    components = {'speed': speed, 'approval': approval, 'responsiveness': responsiveness, 'consistency': consistency}
    known = [(value, COMPONENT_WEIGHTS[key]) for key, value in components.items() if value is not None]
    engagement_score = None
    if known:
        engagement_score = round(sum(v * w for v, w in known) / sum(w for _, w in known), 2)

    return engagement_score, {
        'score_speed': speed,
        'score_approval_rate': approval,
        'score_responsiveness': responsiveness,
        'score_consistency': consistency,
    }


def _decisions_during_leave(leader, member_ids, month_start, month_end):
    """Count team-member requests this leader decided while on their own approved leave.

    Leave periods are clipped to this snapshot's own month (Tirana-local dates)
    so a leave spanning a month boundary is credited to each month only for the
    slice that falls in it.
    """
    if not member_ids:
        return 0

    month_start_date = month_start.astimezone(TIRANA).date()
    month_end_date = month_end.astimezone(TIRANA).date()  # exclusive

    leave_periods = list(
        LeaveRequest.objects.filter(user=leader, status='approved', is_deleted=False)
        .filter(start_date__lt=month_end_date, end_date__gte=month_start_date)
        .values_list('start_date', 'end_date')
    )
    if not leave_periods:
        return 0

    clipped_periods = [
        (max(start, month_start_date), min(end, month_end_date - timedelta(days=1)))
        for start, end in leave_periods
    ]
    window_start = _local_midnight(min(start for start, _ in clipped_periods) - timedelta(days=1))
    window_end = _local_midnight(max(end for _, end in clipped_periods) + timedelta(days=2))

    counted = set()
    for type_key in REQUEST_TYPES:
        model = _TYPE_CONFIG[type_key]['model']
        decided = model.objects.filter(
            user_id__in=member_ids,
            approved_by=leader,
            status__in=('approved', 'rejected'),
            approved_at__gte=window_start,
            approved_at__lt=window_end,
            is_deleted=False,
        ).values_list('id', 'approved_at')
        for obj_id, approved_at in decided:
            decided_date = approved_at.astimezone(TIRANA).date()
            if any(start <= decided_date <= end for start, end in clipped_periods):
                counted.add((type_key, obj_id))
    return len(counted)


def _decisions_on_holidays(leader, member_ids, month_start, month_end, holidays):
    """Count team-member requests this leader decided on a public holiday (evidence only)."""
    if not member_ids or not holidays:
        return 0
    counted = set()
    for type_key in REQUEST_TYPES:
        model = _TYPE_CONFIG[type_key]['model']
        decided = model.objects.filter(
            user_id__in=member_ids,
            approved_by=leader,
            status__in=('approved', 'rejected'),
            approved_at__gte=month_start,
            approved_at__lt=month_end,
            is_deleted=False,
        ).values_list('id', 'approved_at')
        for obj_id, approved_at in decided:
            if approved_at.astimezone(TIRANA).date() in holidays:
                counted.add((type_key, obj_id))
    return len(counted)


def compute_tl_metric(leader, team, month, scope=None):
    """Compute (or refresh) one (leader, team, month) snapshot. Idempotent."""
    month_start, month_end = month_bounds(month)
    member_ids = team_member_ids(leader, team, scope)
    now = _now()
    holidays = holiday_dates_for(
        leader,
        month_start.date() - timedelta(days=HOLIDAY_WINDOW_DAYS),
        month_end.date() + timedelta(days=HOLIDAY_WINDOW_DAYS),
    )

    metrics = {}
    all_fractions = []
    submitter_ids = set()
    next_deadline = None
    for type_key in REQUEST_TYPES:
        type_metrics, fractions, type_next, submitters = compute_type_metrics(
            type_key, member_ids, month_start, month_end, holidays, now
        )
        metrics[type_key] = type_metrics
        all_fractions.extend(fractions)
        submitter_ids |= submitters
        if type_next and (next_deadline is None or type_next < next_deadline):
            next_deadline = type_next

    total_decided = sum(m['decided'] for m in metrics.values())
    total_approved = sum(m['approved'] for m in metrics.values())
    approval_rate_pct = round((total_approved / total_decided) * 100, 2) if total_decided else None

    engagement_score, sub_scores = compute_engagement_score(metrics, all_fractions)

    snapshot, _ = TLApprovalMetric.objects.update_or_create(
        leader=leader,
        team=team,
        month=month_start.date(),
        defaults={
            'metrics': metrics,
            'team_size': len(member_ids),
            'active_submitters': len(submitter_ids),
            'approval_rate_pct': approval_rate_pct,
            'resubmission_count': sum(m['resubmission_count'] for m in metrics.values()),
            'engagement_score': engagement_score,
            'decisions_during_leave': _decisions_during_leave(leader, member_ids, month_start, month_end),
            'decisions_on_holidays': _decisions_on_holidays(leader, member_ids, month_start, month_end, holidays),
            'next_deadline_at': next_deadline,
            'computed_at': now,
            **sub_scores,
        },
    )
    return snapshot


def months_with_activity():
    """Every month that has a snapshot or a submitted request, oldest first."""
    months = set(TLApprovalMetric.objects.values_list('month', flat=True).distinct())
    for model in (LeaveRequest, OvertimeLog, StandbyLog):
        months |= {
            value.date()
            for value in model.objects.filter(is_deleted=False, submitted_at__isnull=False)
            .annotate(month_start=TruncMonth('submitted_at', tzinfo=TIRANA))
            .values_list('month_start', flat=True)
            .distinct()
        }
    return sorted(months)


def _sum_type_metric(rows, key):
    return sum(m.get(key, 0) for r in rows for m in r.metrics.values())


def aggregate_rows(rows):
    """Aggregate a set of `TLApprovalMetric` rows into one summary dict. Shared by
    the `summary` API action and the Excel export so the two can never disagree."""
    if not rows:
        return None

    team_size = sum(r.team_size for r in rows)
    total_decided = _sum_type_metric(rows, 'decided')
    total_approved = _sum_type_metric(rows, 'approved')

    return {
        'team_size': team_size,
        'active_submitters': sum(r.active_submitters for r in rows),
        'approval_rate_pct': round((total_approved / total_decided) * 100, 2) if total_decided else None,
        'resubmission_count': sum(r.resubmission_count for r in rows),
        'decisions_during_leave': sum(r.decisions_during_leave for r in rows),
        'decisions_on_holidays': sum(r.decisions_on_holidays for r in rows),
        'judgeable': _sum_type_metric(rows, 'judgeable'),
        'on_time': _sum_type_metric(rows, 'on_time'),
        'breaches': _sum_type_metric(rows, 'breaches'),
        'pending_past_deadline': _sum_type_metric(rows, 'pending_past_deadline'),
        'avg_tta_hours': weighted_avg_tta_hours(rows),
        'engagement_score': weighted_mean((r.engagement_score, r.team_size) for r in rows),
        'score_speed': weighted_mean((r.score_speed, r.team_size) for r in rows),
        'score_approval_rate': weighted_mean((r.score_approval_rate, r.team_size) for r in rows),
        'score_responsiveness': weighted_mean((r.score_responsiveness, r.team_size) for r in rows),
        'score_consistency': weighted_mean((r.score_consistency, r.team_size) for r in rows),
        'computed_at': max((r.computed_at for r in rows if r.computed_at), default=None),
    }


def stale_snapshot_ids(rows, scope=None):
    """Primary keys of the snapshots in ``rows`` that must be recomputed.

    A snapshot is stale when it was never computed, has the pre-SLA metric
    shape, a pending deadline has passed (time-based), the membership changed,
    or any member's domain row was touched after computed_at. The domain check
    is one query per request type for the whole batch, so the cost does not
    grow with the number of rows.
    """
    rows = list(rows)
    members = member_sets_for(rows, scope)
    all_members = set().union(*members.values()) if members else set()
    computed = [r.computed_at for r in rows if r.computed_at]
    last_touched = {}
    if computed and all_members:
        earliest = min(computed)
        # A snapshot only depends on requests submitted in its own month, so
        # bound the scan by submitted_at (indexed) instead of each member's whole history.
        first_month_start = _local_midnight(min(r.month for r in rows).replace(day=1))
        for type_key in REQUEST_TYPES:
            model = _TYPE_CONFIG[type_key]['model']
            for user_id, updated_at in model.objects.filter(
                user_id__in=all_members, updated_at__gt=earliest, submitted_at__gte=first_month_start
            ).values_list('user_id', 'updated_at'):
                last_touched[user_id] = max(last_touched.get(user_id, updated_at), updated_at)

    now = _now()
    stale = set()
    for row in rows:
        member_ids = members[(row.leader_id, row.team_id)]
        if (
            not row.computed_at
            or any(key not in row.metrics.get(type_key, {}) for type_key in REQUEST_TYPES for key in SLA_METRIC_KEYS)
            or (row.next_deadline_at and now >= row.next_deadline_at)
            or len(member_ids) != row.team_size
            or any(last_touched.get(user_id, row.computed_at) > row.computed_at for user_id in member_ids)
        ):
            stale.add(row.pk)
    return stale


def is_stale(snapshot):
    return snapshot.pk in stale_snapshot_ids([snapshot])
