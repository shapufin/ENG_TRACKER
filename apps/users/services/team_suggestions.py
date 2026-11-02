"""Suggested team additions: a person works clients that nobody on their own teams works.

Read-only. Nothing is moved here: an admin applies a suggestion through the normal membership
writer (``team_membership.change_user_teams``), so teams stay a manual decision. A suggestion
disappears by itself once a teammate shares the client or the person joins such a team.

One row per person (not per client). Evidence is weighted by approved overtime over the last
``LOOKBACK_DAYS``: an assignment counts as 1 and every logged hour on that client adds to it, so
the clients a person really works outweigh ones they are only listed on. The best team is the one
with the highest weight of the person's uncovered clients; ties go to a team somebody can approve
for, then to the team whose members logged more on those clients, then to more teammates.

Italian TLs are managers who follow their people across teams, so they are never suggested a team
and never count as a teammate.
"""
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.db.models import Sum

from apps.overtime.models import Client, OvertimeLog
from apps.users.models import Team, UserProfile
from apps.users.models.core import TeamMembership, UserTech
from apps.users.services.non_team_roles import non_team_user_q
from apps.users.services.orphan_check import _teams_nobody_can_approve
from apps.users.services.team_leaders import italian_tl_user_ids
from core.utils.timezone_local import business_today

MAX_ALTERNATIVES = 2
LOOKBACK_DAYS = 90


def _overtime_hours():
    """``{(user_id, client_id): hours}`` of approved overtime inside the lookback window."""
    since = business_today() - timedelta(days=LOOKBACK_DAYS)
    rows = (
        OvertimeLog.objects.filter(status='approved', is_deleted=False, date__gte=since)
        .values_list('user_id', 'client_id')
        .annotate(total=Sum('hours'))
    )
    return {(user_id, client_id): float(total or Decimal(0)) for user_id, client_id, total in rows}


def _client_pairs():
    """``(profile_id, client_id, user_id)`` for active people on active clients (staff,
    superusers, Italian TLs and people whose role sits outside every team, like HR/HBPR/CR/admin,
    are excluded)."""
    return list(
        UserProfile.clients.through.objects.filter(
            client__is_active=True,
            userprofile__user__is_active=True,
            userprofile__user__is_staff=False,
            userprofile__user__is_superuser=False,
        )
        .exclude(non_team_user_q('userprofile__user__'))
        .exclude(userprofile__user_id__in=italian_tl_user_ids())
        .values_list('userprofile_id', 'client_id', 'userprofile__user_id')
    )


def suggest_team_moves():
    pairs = _client_pairs()
    if not pairs:
        return []
    hours = _overtime_hours()
    clients_of = defaultdict(set)  # profile_id -> {client_id}
    user_of = {}
    for profile_id, client_id, user_id in pairs:
        clients_of[profile_id].add(client_id)
        user_of[profile_id] = user_id

    # A deactivated account keeps its memberships, so it must not count as a teammate.
    teams_of = defaultdict(set)  # profile_id -> {team_id}
    for team_id, profile_id in TeamMembership.objects.filter(
        team__is_active=True, user_profile__user__is_active=True
    ).values_list('team_id', 'user_profile_id'):
        teams_of[profile_id].add(team_id)

    # Techs of each active profile: a person in a discipline (e.g. DBA) must never
    # be suggested a team of a different discipline (e.g. Infrastructure).
    techs_of = defaultdict(set)  # profile_id -> {tech_id}
    for profile_id, tech_id in UserTech.objects.filter(
        user_profile__user__is_active=True,
        tech__is_active=True,
    ).values_list('user_profile_id', 'tech_id'):
        techs_of[profile_id].add(tech_id)

    # Techs of each active team (union of active members' techs)
    team_techs = defaultdict(set)  # team_id -> {tech_id}
    for profile_id, tids in teams_of.items():
        p_techs = techs_of.get(profile_id, set())
        for tid in tids:
            team_techs[tid] |= p_techs

    # Who in each team works each client (every active person, not only the candidates).
    holders = defaultdict(set)  # (team_id, client_id) -> {profile_id}
    for profile_id, client_id, _user_id in pairs:
        for team_id in teams_of.get(profile_id, ()):
            holders[(team_id, client_id)].add(profile_id)

    def logged(profile_id, client_id):
        return hours.get((user_of[profile_id], client_id), 0.0)

    # profile_id -> (uncovered client ids, [(team_id, covered ids, teammates, teammate hours)])
    found = {}
    for profile_id, client_ids in clients_of.items():
        own = teams_of.get(profile_id, set())
        user_techs = techs_of.get(profile_id, set())

        # Uncovered: clients not worked by any teammate in the person's own teams.
        # If the user has assigned tech(s), only teammates sharing at least one tech count.
        uncovered = set()
        for cid in client_ids:
            covered_in_own = False
            for tid in own:
                mates = holders.get((tid, cid), set()) - {profile_id}
                if not user_techs:
                    if mates:
                        covered_in_own = True
                        break
                else:
                    if any(not user_techs.isdisjoint(techs_of.get(mid, set())) for mid in mates):
                        covered_in_own = True
                        break
            if not covered_in_own:
                uncovered.add(cid)

        if not uncovered:
            continue

        per_team = {}  # team_id -> (covered client ids, teammate profile ids, [teammate hours])
        for (team_id, cid), people in holders.items():
            if cid in uncovered and team_id not in own:
                # Never suggest a team of a different tech:
                if user_techs:
                    t_techs = team_techs.get(team_id, set())
                    if not t_techs or user_techs.isdisjoint(t_techs):
                        continue
                    matching_people = {
                        pid for pid in people
                        if not user_techs.isdisjoint(techs_of.get(pid, set()))
                    }
                    if not matching_people:
                        continue
                else:
                    matching_people = people

                covered, mates, team_hours = per_team.setdefault(team_id, (set(), set(), [0.0]))
                covered.add(cid)
                mates |= matching_people
                team_hours[0] += sum(logged(pid, cid) for pid in matching_people)

        if per_team:
            found[profile_id] = (
                uncovered,
                [(tid, covered, len(mates), th[0]) for tid, (covered, mates, th) in per_team.items()],
            )
    if not found:
        return []

    profiles = {p.id: p for p in UserProfile.objects.filter(id__in=found).select_related('user')}
    client_ids = {cid for uncovered, _ in found.values() for cid in uncovered}
    clients = {c.id: c for c in Client.objects.filter(id__in=client_ids)}
    team_ids = {tid for _, options in found.values() for tid, *_ in options}
    team_ids |= {tid for pid in found for tid in teams_of.get(pid, ())}
    teams = {t.id: t for t in Team.objects.filter(id__in=team_ids)}
    no_approver = set(
        _teams_nobody_can_approve(Team.objects.active().filter(id__in=team_ids)).values_list('id', flat=True)
    )

    result = []
    for profile_id, (uncovered, options) in found.items():
        def client_row(cid, profile_id=profile_id):
            c = clients[cid]
            return {'id': cid, 'name': c.name, 'code': c.code, 'hours': round(logged(profile_id, cid), 1)}

        def weight(covered, profile_id=profile_id):
            return sum(1 + logged(profile_id, cid) for cid in covered)

        # A client or team archived between the reads is simply not suggested (read-only report).
        live = []
        for tid, covered, sharing, team_hours in options:
            covered = [c for c in covered if c in clients]
            if tid in teams and covered:
                live.append((tid, covered, sharing, team_hours))
        if not live:
            continue
        live.sort(key=lambda o: (-weight(o[1]), o[0] in no_approver, -o[3], -o[2], o[0]))

        def option(tid, covered, sharing, team_hours, client_row=client_row):
            t = teams[tid]
            return {
                'team': {'id': tid, 'name': t.name, 'code': t.code},
                'has_approver': tid not in no_approver,
                'clients': [client_row(cid) for cid in sorted(covered, key=lambda c: clients[c].name)],
                'sharing': sharing,
                'team_hours': round(team_hours, 1),
            }

        best, rest = live[0], live[1:1 + MAX_ALTERNATIVES]
        user = profiles[profile_id].user
        own_hours = sum(logged(profile_id, cid) for cid in uncovered if cid in clients)
        result.append({
            'user_id': user.id,
            'username': user.username,
            'full_name': user.get_full_name() or user.username,
            'current_teams': [
                {'id': tid, 'name': teams[tid].name, 'code': teams[tid].code}
                for tid in sorted(teams_of.get(profile_id, ()), key=lambda t: teams[t].name) if tid in teams
            ],
            'recommendation': option(*best),
            'alternatives': [option(*o) for o in rest],
            # Still uncovered after the recommended team: the admin must look at these by hand.
            'remaining_clients': [
                client_row(cid)
                for cid in sorted(uncovered - set(best[1]), key=lambda c: clients[c].name) if cid in clients
            ],
            # "overtime" when the person logged approved hours on these clients, else a bare assignment.
            'basis': 'overtime' if own_hours > 0 else 'assignment',
            'person_hours': round(own_hours, 1),
            'lookback_days': LOOKBACK_DAYS,
        })
    # Strongest evidence first: people who actually log overtime on the uncovered clients.
    result.sort(key=lambda row: (-row['person_hours'], row['username']))
    return result
