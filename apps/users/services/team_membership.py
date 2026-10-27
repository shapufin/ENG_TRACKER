"""The one place a user's team memberships change (team lifecycle plan, Phase 3).

Every writer (user form, bulk edit, create, import) goes through ``change_user_teams``. It
diffs the new set of teams against the current one, so removing a user from team A never
touches team B, writes ``TeamMembershipHistory`` for what was removed and audits each
add/remove. Records (overtime, standby, leave, KPI) are never touched.

Removing a team does not remove ``italian_tl`` / ``albanian_tl``: those FKs are a separate
path in ``UserProfile.get_team_member_ids``. ``tl_link_followup`` reports the ones that
still point at a leader of a removed team, and clears them on request.
"""
from dataclasses import dataclass, field

from django.contrib.auth.models import User
from django.utils import timezone

from apps.users.models import Team, TeamMembership, TeamMembershipHistory, UserProfile
from apps.users.services.team_leaders import derive_team_tls
from core.services.lifecycle import record_lifecycle_event

TL_FIELDS = ('italian_tl', 'albanian_tl')


@dataclass
class TeamChange:
    added: list = field(default_factory=list)
    removed: list = field(default_factory=list)
    # {team_id: {user_id, ...}} leaders tied to each removed team, computed before the change.
    leaders_by_removed_team: dict = field(default_factory=dict)

    def __bool__(self):
        return bool(self.added or self.removed)


def _team_leader_ids(team_ids, derived=None):
    """{team_id: {leader user ids}}: the team's ``team_leader`` plus its members' derived TLs."""
    teams = Team.objects.filter(pk__in=team_ids)
    derived = derive_team_tls(list(team_ids)) if derived is None else derived
    result = {}
    for team in teams:
        ids = {team.team_leader_id} if team.team_leader_id else set()
        ids |= {user.pk for user in derived.get(team.pk, {}).values() if user}
        result[team.pk] = ids
    return result


def _audit(request, actor, team, profile, operation):
    record_lifecycle_event(
        request, team, 'team', 'UPDATE', operation,
        extra={'user_id': profile.user_id, 'username': profile.user.username},
        actor=actor,
    )


def change_user_teams(profile, team_refs, *, request=None, actor=None, reason='membership changed'):
    """Set ``profile``'s teams to ``team_refs`` (ids or ``Team`` objects). Returns a ``TeamChange``.

    Callers reject archived teams before this (``archived_team_error``).
    """
    actor = actor or (getattr(request, 'user', None) if request is not None else None)
    if actor is not None and not getattr(actor, 'is_authenticated', False):
        actor = None
    new_ids = {getattr(ref, 'pk', ref) for ref in team_refs or [] if ref}
    current = {m.team_id: m for m in TeamMembership.objects.filter(user_profile=profile).select_related('team')}
    removed_ids = set(current) - new_ids
    added_ids = new_ids - set(current)
    change = TeamChange()
    if not removed_ids and not added_ids:
        return change

    change.leaders_by_removed_team = _team_leader_ids(removed_ids) if removed_ids else {}
    change.removed = [current[tid].team for tid in sorted(removed_ids)]
    now = timezone.now()
    if removed_ids:
        TeamMembershipHistory.objects.bulk_create([
            TeamMembershipHistory(
                team=current[tid].team, team_name=current[tid].team.name, team_code=current[tid].team.code,
                user=profile.user, username=profile.user.username,
                joined_date=current[tid].joined_date, is_primary_team=current[tid].is_primary_team,
                removed_at=now, removed_by=actor, reason=reason,
            )
            for tid in sorted(removed_ids)
        ])
    profile.teams.set(new_ids)
    change.added = list(Team.objects.filter(pk__in=added_ids).order_by('pk'))
    for team in change.removed:
        _audit(request, actor, team, profile, 'member_remove')
    for team in change.added:
        _audit(request, actor, team, profile, 'member_add')
    return change


def note_member_added(profile, team, *, request=None, actor=None):
    """Audit a single additive membership (``_assign_team_to_profile``)."""
    _audit(request, actor, team, profile, 'member_add')


def tl_link_followup(profile, change, *, unassign=False, request=None, actor=None):
    """Warn about, or clear, TL links that still point at a leader of a removed team.

    Run after the caller applied any ``italian_tl`` / ``albanian_tl`` edit from the same
    request and BEFORE it saves ``profile`` (clearing only sets the in-memory FK, so it
    commits or rolls back with the caller's save). A leader who also leads or is derived
    for a team the user keeps is not flagged. Returns ``(warnings, removed_team_leader_ids)``.
    """
    if not change.removed:
        return [], []
    kept_team_ids = set(profile.teams.values_list('pk', flat=True))
    candidates = set().union(*change.leaders_by_removed_team.values())
    # A leader the user still has through a kept team: it leads that team, or another
    # member of it points at them. The user's own link is not evidence (it would
    # make every leader look like the derived TL of the team they were just in).
    kept_leader_ids = set(
        Team.objects.filter(pk__in=kept_team_ids, team_leader_id__in=candidates).values_list('team_leader_id', flat=True)
    )
    if kept_team_ids and candidates:
        others = UserProfile.objects.filter(teams__in=kept_team_ids).exclude(pk=profile.pk)
        for tl_field in TL_FIELDS:
            kept_leader_ids |= set(
                others.filter(**{f'{tl_field}_id__in': candidates}).values_list(f'{tl_field}_id', flat=True)
            )
    removed_leader_ids = sorted(candidates - kept_leader_ids)
    names = {}
    for team in change.removed:
        for leader_id in change.leaders_by_removed_team.get(team.pk, ()):
            names.setdefault(leader_id, []).append(team.name)

    warnings = []
    for tl_field in TL_FIELDS:
        leader_id = getattr(profile, f'{tl_field}_id')
        if leader_id is None or leader_id not in names or leader_id in kept_leader_ids:
            continue
        if unassign:
            setattr(profile, f'{tl_field}_id', None)
            record_lifecycle_event(
                request, profile.user, 'user', 'UPDATE', 'tl_link_cleared',
                old={tl_field: leader_id}, new={tl_field: None},
                extra={'teams': names[leader_id]}, actor=actor,
            )
            continue
        leader_username = User.objects.filter(pk=leader_id).values_list('username', flat=True).first()
        warnings.append({
            'code': 'tl_link_remains',
            'field': tl_field,
            'user_id': leader_id,
            'leader_username': leader_username,
            'member_id': profile.user_id,
            'member_username': profile.user.username,
            'teams': names[leader_id],
            'message': (
                f'{profile.user.username} is still managed by {leader_username} through {tl_field}, '
                f'although they left {", ".join(names[leader_id])}. Clear the link to remove that access.'
            ),
        })
    return warnings, removed_leader_ids
