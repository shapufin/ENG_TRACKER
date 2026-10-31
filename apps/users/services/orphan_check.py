"""Read-only report of records nothing points at: the mistakes manual team setup invites.

Nothing here writes. Archived teams and clients, inactive users, staff/superusers and users whose
role does not belong in a team (HR, HBPR, Control Room, admin) are never reported.
"""
from django.contrib.auth.models import User
from django.db.models import Count, Q

from apps.overtime.models import Client
from apps.users.models import Team
from apps.users.services.non_team_roles import non_team_user_q


def _users_without_team():
    # Same three sources as the Admin Users role tabs (see non_team_roles.py).
    users = (
        User.objects.filter(is_active=True, is_staff=False, is_superuser=False)
        .exclude(non_team_user_q())
        # Single-condition excludes: "has a membership in an ACTIVE team", per related row.
        .exclude(profile__teams__is_active=True)
        .exclude(led_teams__is_active=True)
        .order_by('username')
    )
    return [
        {'id': u.id, 'username': u.username, 'full_name': u.get_full_name() or u.username}
        for u in users
    ]


def _active_teams():
    """Active teams with their active-member count (a deactivated account fills no slot)."""
    return Team.objects.active().annotate(
        active_member_total=Count('members', filter=Q(members__user__is_active=True), distinct=True)
    )


def _team_rows(queryset):
    return [
        {'id': t.id, 'name': t.name, 'code': t.code, 'members_count': t.active_member_total}
        for t in queryset.order_by('name')
    ]


def _teams_nobody_can_approve(teams):
    """Active teams with neither an approval leader nor a member's own TL.

    ``can_approve`` grants approval through ``Team.team_leader`` *and* through the
    member's own ``italian_tl``/``albanian_tl``, so a team whose members have an
    active TL does have approvers — reporting it would be a false alarm. A
    deactivated TL approves nothing, so it does not count as coverage.
    """
    covered = Q(
        members__user__is_active=True,
        members__italian_tl__isnull=False,
        members__italian_tl__is_active=True,
    ) | Q(
        members__user__is_active=True,
        members__albanian_tl__isnull=False,
        members__albanian_tl__is_active=True,
    )
    return teams.filter(
        Q(team_leader__isnull=True) | Q(team_leader__is_active=False)
    ).exclude(covered)


def find_orphans():
    teams = _active_teams()
    clients = (
        Client.objects.filter(is_active=True)
        .annotate(
            active_assignees=Count(
                'assigned_users', filter=Q(assigned_users__user__is_active=True), distinct=True
            )
        )
        .filter(active_assignees=0)
        .order_by('name')
    )
    return {
        'users_without_team': _users_without_team(),
        # A deactivated leader keeps the FK (deactivation changes nothing else), but nobody
        # approves their team's requests, so it belongs in this list.
        'teams_without_leader': _team_rows(_teams_nobody_can_approve(teams)),
        'empty_teams': _team_rows(teams.filter(active_member_total=0)),
        'unassigned_clients': [{'id': c.id, 'name': c.name, 'code': c.code} for c in clients],
    }
