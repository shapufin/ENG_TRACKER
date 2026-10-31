"""Suggested team moves: a person works a client that nobody on their own teams works.

Read-only. Nothing is moved here: an admin applies a suggestion through the normal membership
writer (``team_membership.change_user_teams``), so teams stay a manual decision. A suggestion
disappears by itself once a teammate shares the client or the person joins such a team.
"""

from apps.overtime.models import Client
from apps.users.models import Team, UserProfile
from apps.users.models.core import TeamMembership

MAX_TEAMS_PER_CLIENT = 3


def _candidate_profiles():
    """``{profile_id: {client_id}}`` for active people on active clients (staff and superusers excluded)."""
    pairs = UserProfile.clients.through.objects.filter(
        client__is_active=True,
        userprofile__user__is_active=True,
        userprofile__user__is_staff=False,
        userprofile__user__is_superuser=False,
    ).values_list('userprofile_id', 'client_id')
    clients_of = {}
    for profile_id, client_id in pairs:
        clients_of.setdefault(profile_id, set()).add(client_id)
    return clients_of


def suggest_team_moves():
    clients_of = _candidate_profiles()
    if not clients_of:
        return []

    members_of = {}  # team_id -> {profile_id}
    teams_of = {}  # profile_id -> {team_id}
    for team_id, profile_id in TeamMembership.objects.filter(team__is_active=True).values_list(
        'team_id', 'user_profile_id'
    ):
        members_of.setdefault(team_id, set()).add(profile_id)
        teams_of.setdefault(profile_id, set()).add(team_id)

    # How many people in each team work each client (every active person, not only the candidates).
    everyone = UserProfile.clients.through.objects.filter(client__is_active=True).values_list(
        'userprofile_id', 'client_id'
    )
    holders = {}  # (team_id, client_id) -> number of members on that client
    for profile_id, client_id in everyone:
        for team_id in teams_of.get(profile_id, ()):
            holders[(team_id, client_id)] = holders.get((team_id, client_id), 0) + 1

    found = {}  # profile_id -> [(client_id, [(team_id, sharing)])]
    for profile_id, client_ids in clients_of.items():
        own = teams_of.get(profile_id, set())
        for client_id in sorted(client_ids):
            # The person counts as one holder in their own teams, so 2+ means a real teammate.
            if any(holders.get((team_id, client_id), 0) >= 2 for team_id in own):
                continue
            options = sorted(
                ((team_id, count) for (team_id, cid), count in holders.items()
                 if cid == client_id and team_id not in own),
                key=lambda option: (-option[1], option[0]),
            )[:MAX_TEAMS_PER_CLIENT]
            if options:
                found.setdefault(profile_id, []).append((client_id, options))
    if not found:
        return []

    profiles = {p.id: p for p in UserProfile.objects.filter(id__in=found).select_related('user')}
    clients = {c.id: c for c in Client.objects.filter(id__in={cid for rows in found.values() for cid, _ in rows})}
    team_ids = {tid for rows in found.values() for _, options in rows for tid, _ in options}
    teams = {t.id: t for t in Team.objects.filter(id__in=team_ids)}

    result = []
    for profile_id, rows in found.items():
        user = profiles[profile_id].user
        result.append({
            'user_id': user.id,
            'username': user.username,
            'full_name': user.get_full_name() or user.username,
            'team_ids': sorted(teams_of.get(profile_id, ())),
            'suggestions': [
                {
                    'client': {'id': client_id, 'name': clients[client_id].name, 'code': clients[client_id].code},
                    'teams': [
                        {'id': tid, 'name': teams[tid].name, 'code': teams[tid].code, 'sharing': count}
                        for tid, count in options
                    ],
                }
                for client_id, options in rows
            ],
        })
    result.sort(key=lambda row: row['username'])
    return result
