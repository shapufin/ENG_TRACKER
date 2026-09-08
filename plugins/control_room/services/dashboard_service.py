"""
Dashboard service for the Control Room plugin.

Builds the read-only scoped standby dashboard response. All queries go
through the scope_service to enforce team visibility.

Status policy (MVP):
- pending + approved are visible by default ("pending_approved" mode).
- approved_only: only approved records.
- all: pending + approved + rejected.
- include_rejected: additional flag to include rejected in any mode.

Empty scope for non-admin users = NO data (not global).
"""
from collections import defaultdict
from datetime import date, timedelta
from math import ceil
from typing import Optional, Sequence

from django.contrib.auth.models import User
from django.db.models import Q, Sum, Count

from apps.standby.models.core import StandbyLog
from apps.users.models.core import Team, TeamMembership

from plugins.control_room.services.scope_service import (
    get_allowed_team_ids, get_allowed_user_ids, can_access_dashboard,
)


STATUS_MODES = {
    'pending_approved': ['pending', 'approved'],
    'approved_only': ['approved'],
    'all': ['pending', 'approved', 'rejected'],
}

# Sentinel for ``_resolved_team_ids`` default so callers can explicitly
# pass ``None`` (global/admin scope) without it being treated as "unset".
_TEAM_IDS_UNSET = object()


def _resolve_statuses(status_mode: str, include_rejected: bool) -> list:
    """Resolve the list of standby statuses to include."""
    statuses = STATUS_MODES.get(status_mode, STATUS_MODES['pending_approved'])
    if include_rejected and 'rejected' not in statuses:
        statuses = statuses + ['rejected']
    return statuses


def _validate_date_range(date_from: str, date_to: str) -> tuple:
    """Parse and validate date range. Returns (date_from, date_to) as date objects."""
    try:
        d_from = date.fromisoformat(date_from) if date_from else date.today()
        d_to = date.fromisoformat(date_to) if date_to else d_from + timedelta(days=6)
    except (ValueError, TypeError) as e:
        raise ValueError(f"Invalid date format: {e}")
    if d_from > d_to:
        raise ValueError("date_from cannot be after date_to")
    return d_from, d_to


def get_scoped_standby_queryset(
    user: User,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    team_ids: Optional[Sequence[int]] = None,
    status_mode: str = 'pending_approved',
    include_rejected: bool = False,
    _resolved_team_ids: object = _TEAM_IDS_UNSET,
):
    """Return a scoped StandbyLog queryset for the dashboard.

    Returns None if the user has no dashboard access.
    Returns an empty queryset if the user has access but empty scope.

    ``team_ids``: optional list of team IDs to filter to. When provided,
    each ID is validated to exist and be within the user's scope. An
    empty list/None means "all teams in scope".

    ``_resolved_team_ids`` lets a caller that already resolved the scope
    (via ``get_allowed_team_ids``) skip the redundant DB query. Accepts
    ``None`` (global/admin) or a set of team IDs. When unset (the
    sentinel), the scope is resolved here.
    """
    if not can_access_dashboard(user):
        return None

    d_from, d_to = _validate_date_range(date_from or '', date_to or '')

    if _resolved_team_ids is not _TEAM_IDS_UNSET:
        scope_team_ids = _resolved_team_ids
    else:
        scope_team_ids = get_allowed_team_ids(user)
    # scope_team_ids is None for global (admin), set() for empty scope.

    if scope_team_ids == set():
        return StandbyLog.objects.none()

    # If specific teams are requested, validate they exist and are in scope.
    filter_team_ids = list(team_ids) if team_ids else None
    if filter_team_ids:
        existing = set(Team.objects.filter(id__in=filter_team_ids).values_list('id', flat=True))
        missing = set(filter_team_ids) - existing
        if missing:
            raise ValueError(f'Team(s) {sorted(missing)} do not exist.')
        if scope_team_ids is not None:
            out_of_scope = set(filter_team_ids) - scope_team_ids
            if out_of_scope:
                raise PermissionError(
                    f"Team(s) {sorted(out_of_scope)} are not in the user's Control Room scope."
                )
        scoped_team_ids = set(filter_team_ids)
    else:
        scoped_team_ids = scope_team_ids  # None = all teams (admin), set = scoped

    # Resolve allowed user IDs from the scoped teams.
    allowed_user_ids = get_allowed_user_ids(user, team_ids=scoped_team_ids)
    if not allowed_user_ids:
        return StandbyLog.objects.none()

    queryset = (
        StandbyLog.objects
        .select_related('user', 'approved_by', 'user__profile')
        .filter(user_id__in=allowed_user_ids)
    )

    # Date filter
    queryset = queryset.filter(date__gte=d_from, date__lte=d_to)

    # Status filter
    statuses = _resolve_statuses(status_mode, include_rejected)
    queryset = queryset.filter(status__in=statuses)

    return queryset


def build_summary(user: User, date_from: str, date_to: str,
                  team_ids: Optional[Sequence[int]] = None,
                  status_mode: str = 'pending_approved',
                  include_rejected: bool = False) -> dict:
    """Build the dashboard summary response."""
    # Resolve the scope once and reuse it for both the queryset filter and
    # the coverage calculation, avoiding a redundant DB query for non-admin
    # users (who hit get_allowed_team_ids twice otherwise).
    scope_team_ids = get_allowed_team_ids(user)
    queryset = get_scoped_standby_queryset(
        user, date_from, date_to, team_ids, status_mode, include_rejected,
        _resolved_team_ids=scope_team_ids,
    )
    if queryset is None:
        return {'error': 'No Control Room access'}

    is_global = scope_team_ids is None

    # Resolve the team set for coverage calculation.
    filter_list = list(team_ids) if team_ids else None
    if filter_list:
        coverage_team_ids = set(filter_list)
    elif scope_team_ids is not None:
        coverage_team_ids = scope_team_ids
    else:
        coverage_team_ids = set(
            Team.objects.values_list('id', flat=True)
        )

    # Summary aggregates
    aggregates = queryset.aggregate(
        total_hours=Sum('hours'),
        approved_hours=Sum('hours', filter=Q(status='approved')),
        pending_hours=Sum('hours', filter=Q(status='pending')),
        rejected_hours=Sum('hours', filter=Q(status='rejected')),
        entry_count=Count('id'),
        person_count=Count('user_id', distinct=True),
    )

    # Load team metadata and memberships once. Coverage aggregation is grouped
    # by the real through-table relation so query count does not scale with the
    # number of teams in scope.
    teams_by_id = {
        team.id: team
        for team in Team.objects.filter(id__in=coverage_team_ids)
    }
    members_by_team = defaultdict(set)
    for tid, user_id in TeamMembership.objects.filter(
        team_id__in=coverage_team_ids
    ).values_list('team_id', 'user_profile__user_id'):
        members_by_team[tid].add(user_id)

    coverage_aggregates = {}
    for row in queryset.filter(
        user__profile__team_memberships__team_id__in=coverage_team_ids
    ).values(
        'user__profile__team_memberships__team_id'
    ).annotate(
        planned_hours=Sum('hours'),
        approved_hours=Sum('hours', filter=Q(status='approved')),
        pending_hours=Sum('hours', filter=Q(status='pending')),
        covered_member_count=Count('user_id', distinct=True),
    ):
        team_id_value = row['user__profile__team_memberships__team_id']
        coverage_aggregates[team_id_value] = row

    # Coverage by team
    coverage = []
    for tid in sorted(coverage_team_ids):
        team = teams_by_id.get(tid)
        if team is None:
            continue
        team_member_count = len(members_by_team[tid])
        team_agg = coverage_aggregates.get(tid, {})
        covered_member_count = team_agg.get('covered_member_count', 0) or 0
        coverage_percent = (
            (covered_member_count / team_member_count * 100.0)
            if team_member_count else 0.0
        )
        coverage.append({
            'team_id': tid,
            'team_name': team.name,
            'team_code': team.code,
            'member_count': team_member_count,
            'covered_member_count': covered_member_count,
            'planned_hours': float(team_agg.get('planned_hours') or 0),
            'approved_hours': float(team_agg.get('approved_hours') or 0),
            'pending_hours': float(team_agg.get('pending_hours') or 0),
            'coverage_percent': round(coverage_percent, 1),
        })

    covered_team_count = sum(1 for c in coverage if c['covered_member_count'] > 0)

    return {
        'date_from': date_from,
        'date_to': date_to,
        'scope': {
            'is_global': is_global,
            'team_ids': sorted(scope_team_ids) if scope_team_ids is not None else None,
        },
        'summary': {
            'team_count': len(coverage_team_ids),
            'covered_team_count': covered_team_count,
            'uncovered_team_count': len(coverage_team_ids) - covered_team_count,
            'person_count': aggregates['person_count'] or 0,
            'standby_entry_count': aggregates['entry_count'] or 0,
            'planned_hours': float(aggregates['total_hours'] or 0),
            'approved_hours': float(aggregates['approved_hours'] or 0),
            'pending_hours': float(aggregates['pending_hours'] or 0),
        },
        'coverage_by_team': coverage,
    }


def build_daily_trend(user: User, date_from: str, date_to: str,
                      team_ids: Optional[Sequence[int]] = None,
                      status_mode: str = 'pending_approved',
                      include_rejected: bool = False) -> list:
    """Build daily trend data for the selected date range."""
    queryset = get_scoped_standby_queryset(
        user, date_from, date_to, team_ids, status_mode, include_rejected
    )
    if queryset is None:
        return []

    trend = (
        queryset
        .values('date')
        .annotate(
            planned_hours=Sum('hours'),
            approved_hours=Sum('hours', filter=Q(status='approved')),
            standby_people=Count('user_id', distinct=True),
        )
        .order_by('date')
    )

    return [
        {
            'date': entry['date'].isoformat() if entry['date'] else None,
            'planned_hours': float(entry['planned_hours'] or 0),
            'approved_hours': float(entry['approved_hours'] or 0),
            'standby_people': entry['standby_people'] or 0,
        }
        for entry in trend
    ]


def build_roster(user: User, date_from: str, date_to: str,
                 team_ids: Optional[Sequence[int]] = None,
                 status_mode: str = 'pending_approved',
                 include_rejected: bool = False,
                 search: str = '',
                 page: int = 1,
                 page_size: int = 50) -> dict:
    """Build the current standby roster (paginated).

    Each row includes user, team names, standby details, and overnight flag.
    Uses prefetch_related to avoid N+1 on team memberships.
    """
    queryset = get_scoped_standby_queryset(
        user, date_from, date_to, team_ids, status_mode, include_rejected
    )
    if queryset is None:
        return {'count': 0, 'page': page, 'page_size': page_size, 'total_pages': 0, 'results': []}

    if search:
        queryset = queryset.filter(
            Q(user__username__icontains=search) |
            Q(user__first_name__icontains=search) |
            Q(user__last_name__icontains=search) |
            Q(description__icontains=search)
        )

    total = queryset.count()
    queryset = queryset.prefetch_related(
        'user__profile__team_memberships__team'
    ).order_by('-date', '-id')
    start = (page - 1) * page_size

    # Build user→team-names map to avoid per-row queries.
    roster = []
    for log in queryset[start:start + page_size]:
        teams = [
            membership.team.name
            for membership in log.user.profile.team_memberships.all()
            if membership.team
        ]
        is_overnight = (
            log.start_time is not None
            and log.end_time is not None
            and log.end_time <= log.start_time
        )
        roster.append({
            'id': log.id,
            'date': log.date.isoformat(),
            'user_id': log.user_id,
            'user_name': log.user.get_full_name() or log.user.username,
            'username': log.user.username,
            'team_names': teams,
            'hours': float(log.hours),
            'start_time': log.start_time.isoformat() if log.start_time else None,
            'end_time': log.end_time.isoformat() if log.end_time else None,
            'is_overnight': is_overnight,
            'status': log.status,
            'status_display': log.get_status_display(),
            'description': log.description,
        })

    return {
        'count': total,
        'page': page,
        'page_size': page_size,
        'total_pages': ceil(total / page_size) if total else 0,
        'results': roster,
    }
