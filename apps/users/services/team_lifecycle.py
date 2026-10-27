"""Team retirement: archive, restore, delete and purge rules (team lifecycle plan, Phase 2).

Mirrors the Client lifecycle (``apps/overtime/services/client_lifecycle.py``): a team is
retired by archiving it, which unassigns its members but writes
``TeamMembershipHistory`` first. A team is purged only after it has been archived for
``PURGE_AFTER_DAYS`` with nothing left that depends on it. Core never imports a plugin:
plugin-owned relations are found through the reverse accessors.
"""
from datetime import timedelta

from django.db.models import CASCADE, Max
from django.utils import timezone

from core.services.lifecycle import record_lifecycle_event
from core.services.related_records import relation_counts

PURGE_AFTER_DAYS = 365
PENDING = 'pending'

def _real_metric_count(team):
    """Engagement rows that carry numbers: a zero-size, never-used row must not block a delete."""
    rows = getattr(team, 'engagement_metrics', None)
    return rows.filter(team_size__gt=0).count() if rows is not None else 0


def protected_record_counts(team):
    """``{accessor: count}`` of what blocks deleting ``team``.

    Every CASCADE relation (memberships, Control Room scopes, anything added later)
    blocks, so a delete can never silently take rows with it. Live sub-teams,
    engagement rows with real numbers, and a calendar workspace that holds
    holidays block too.
    """
    counts = relation_counts(team, lambda rel: rel.one_to_many and rel.on_delete is CASCADE)
    sub_teams = team.sub_teams.count()
    if sub_teams:
        counts['sub_teams'] = sub_teams
    metrics = _real_metric_count(team)
    if metrics:
        counts['engagement_metrics'] = metrics
    holiday_workspaces = team.calendar_workspaces.filter(holidays__isnull=False).distinct().count()
    if holiday_workspaces:
        counts['calendar_workspaces'] = holiday_workspaces
    return counts


def cascade_record_counts(team):
    """``{accessor: count}`` of rows a delete would detach (kept with a stored label)."""
    counts = {}
    for name in ('engagement_metrics', 'analytics_metrics', 'calendar_workspaces'):
        rows = getattr(team, name, None)
        if rows is not None and rows.count():
            counts[name] = rows.count()
    return counts


def has_history(team):
    """Whether the team was ever used: members now or before, or numbers recorded."""
    return bool(team.user_memberships.exists() or team.membership_history.exists() or _real_metric_count(team))


def last_activity(team):
    """Latest moment something happened to the team itself (aware datetime) or ``None``.

    Records of its former members are not team activity: they live with those users.
    """
    stamps = [
        team.archived_at,
        team.membership_history.aggregate(latest=Max('removed_at'))['latest'],
        team.user_memberships.aggregate(latest=Max('created_at'))['latest'],
    ]
    stamps = [s for s in stamps if s]
    return max(stamps) if stamps else None


def purge_eligible_at(team):
    return team.archived_at + timedelta(days=PURGE_AFTER_DAYS) if team.archived_at else None


def _pending_orphans(team):
    """Pending requests of members who would be left with no other team and no TL link."""
    from apps.leave_management.models import LeaveRequest
    from apps.overtime.models import OvertimeLog
    from apps.standby.models import StandbyLog
    from apps.users.models import UserProfile

    profiles = UserProfile.objects.filter(teams=team)
    orphan_ids = list(
        profiles.exclude(teams__in=type(team).objects.filter(is_active=True).exclude(pk=team.pk))
        .filter(italian_tl__isnull=True, albanian_tl__isnull=True)
        .values_list('user_id', flat=True)
    )
    if not orphan_ids:
        return {}
    counts = {}
    for key, model in (('leave', LeaveRequest), ('overtime', OvertimeLog), ('standby', StandbyLog)):
        count = model.objects.filter(user_id__in=orphan_ids, status=PENDING, is_deleted=False).count()
        if count:
            counts[key] = count
    return counts


def _open_hbpr_assignment(team):
    from apps.users.models.hbpr import HbprAlbanianTlAssignment
    from apps.users.services.hbpr_assignments import unfinished_q

    if not team.team_leader_id:
        return False
    return HbprAlbanianTlAssignment.objects.filter(albanian_tl_id=team.team_leader_id).filter(unfinished_q()).exists()


def archive_blockers(team):
    """Reasons ``team`` cannot be archived yet (empty = it can)."""
    blockers = []
    if not team.is_active:
        return ['Team is already archived.']
    live_sub_teams = team.sub_teams.filter(is_active=True).count()
    if live_sub_teams:
        blockers.append(f'Team still has {live_sub_teams} active sub-team(s): archive or move them first.')
    for key, count in _pending_orphans(team).items():
        blockers.append(
            f'{count} pending {key} request(s) belong to members who would be left without a team leader.'
        )
    if _open_hbpr_assignment(team):
        blockers.append("The team leader has an open HBPR assignment: end it before archiving the leader's team.")
    return blockers


def delete_blockers(team):
    """Reasons ``team`` cannot be hard-deleted yet (empty = it can)."""
    blockers = []
    if team.is_active and has_history(team):
        blockers.append('Team must be archived before it can be deleted.')
    for name, count in protected_record_counts(team).items():
        blockers.append(f'Team still has records that must be kept: {name} ({count}).')
    return blockers


def purge_blockers(team, now=None):
    """Reasons ``team`` cannot be purged yet (empty = it can)."""
    now = now or timezone.now()
    if team.is_active:
        return ['Team is not archived.']
    blockers = []
    eligible = purge_eligible_at(team)
    if eligible and now < eligible:
        blockers.append(f'Team was archived less than {PURGE_AFTER_DAYS} days ago (eligible {eligible:%Y-%m-%d}).')
    activity = last_activity(team)
    if activity and now - activity < timedelta(days=PURGE_AFTER_DAYS):
        blockers.append(f'Team had activity in the last {PURGE_AFTER_DAYS} days.')
    for name, count in relation_counts(team, lambda rel: rel.one_to_many and rel.on_delete is CASCADE).items():
        blockers.append(f'Team still has dependents: {name} ({count}).')
    live_sub_teams = team.sub_teams.filter(is_active=True).count()
    if live_sub_teams:
        blockers.append(f'Team still has {live_sub_teams} active sub-team(s).')
    return blockers


def archived_team_error(teams):
    """Message naming the archived teams in ``teams``, or ``None`` when all are active."""
    names = [team.name for team in teams if not team.is_active]
    if not names:
        return None
    return f'Cannot add members to archived team(s): {", ".join(names)}.'


def archived_error_for_refs(refs):
    """Like ``archived_team_error`` for team ids or ``Team`` objects (``None`` entries are ignored)."""
    from apps.users.models import Team

    ids = {getattr(ref, 'pk', ref) for ref in refs if ref}
    return archived_team_error(Team.objects.filter(pk__in=ids)) if ids else None


def archive_team(team, request):
    """Archive ``team``: write membership history, unassign every member, hide it.

    Returns how many members were unassigned. Records of those members are untouched.
    Call ``archive_blockers`` first; this does not re-check them.
    """
    from django.db import transaction

    from apps.users.models import TeamMembership, TeamMembershipHistory

    now = timezone.now()
    actor = request.user if getattr(request.user, 'is_authenticated', False) else None
    with transaction.atomic():
        memberships = list(TeamMembership.objects.filter(team=team).select_related('user_profile__user'))
        TeamMembershipHistory.objects.bulk_create([
            TeamMembershipHistory(
                team=team, team_name=team.name, team_code=team.code,
                user=m.user_profile.user, username=m.user_profile.user.username,
                joined_date=m.joined_date, is_primary_team=m.is_primary_team,
                removed_at=now, removed_by=actor, reason='team archived',
            )
            for m in memberships
        ])
        TeamMembership.objects.filter(team=team).delete()
        team.is_active = False
        team.archived_at = now
        team.archived_by = actor
        team.save(update_fields=['is_active', 'archived_at', 'archived_by', 'updated_at'])
        record_lifecycle_event(
            request, team, 'team', 'UPDATE', 'archive',
            old={'is_active': True}, new={'is_active': False},
            extra={'members_unassigned': len(memberships)},
        )
    return len(memberships)


def unarchive_team(team, request):
    """Reactivate ``team``. Members are not restored."""
    from django.db import transaction

    with transaction.atomic():
        team.is_active = True
        team.archived_at = None
        team.archived_by = None
        team.save(update_fields=['is_active', 'archived_at', 'archived_by', 'updated_at'])
        record_lifecycle_event(
            request, team, 'team', 'UPDATE', 'unarchive',
            old={'is_active': False}, new={'is_active': True},
        )


def purge_team(team, request, now=None):
    """Hard-delete an archived team that passed ``purge_blockers``. Returns the blockers if refused."""
    blockers = purge_blockers(team, now=now)
    if blockers:
        return blockers
    from django.db import transaction

    with transaction.atomic():
        record_lifecycle_event(
            request, team, 'team', 'DELETE', 'purge',
            old={'code': team.code, 'name': team.name},
        )
        team.delete()
    return []


def lifecycle_summary(team):
    """Everything the lifecycle dialog shows."""
    activity = last_activity(team)
    return {
        'id': team.pk,
        'is_active': team.is_active,
        'archived_at': team.archived_at,
        'purge_eligible_at': purge_eligible_at(team),
        'last_activity': activity,
        'members_count': team.user_memberships.count(),
        'archive_blockers': archive_blockers(team) if team.is_active else [],
        'delete_blockers': delete_blockers(team),
        'purge_blockers': purge_blockers(team) if not team.is_active else [],
        'counts': protected_record_counts(team),
        'cascade_counts': cascade_record_counts(team),
    }
