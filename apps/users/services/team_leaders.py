"""Display-only Manager/Line Manager per team, derived from its members.

Members of a team normally share one Manager and one Line Manager, so the
team's TLs are the ones most members point at. Nothing is stored: this never
touches ``Team.team_leader`` (and so never changes TL scope via ``led_teams``).
"""
from collections import Counter, defaultdict

from django.contrib.auth.models import User
from django.db.models import Q

from apps.users.models import TeamMembership

SIDES = ('italian_tl', 'albanian_tl')


def derive_team_tls(team_ids=None):
    """Return ``{team_id: {'italian_tl': User|None, 'albanian_tl': User|None}}``.

    Active members vote; the most common TL wins, ties go to the lowest user
    id. Two queries regardless of how many teams are asked for.
    """
    memberships = TeamMembership.objects.filter(
        user_profile__user__is_active=True, is_deleted=False,
    )
    if team_ids is not None:
        memberships = memberships.filter(team_id__in=team_ids)

    votes = defaultdict(lambda: {side: Counter() for side in SIDES})
    for team_id, it_id, al_id in memberships.values_list(
        'team_id', 'user_profile__italian_tl_id', 'user_profile__albanian_tl_id',
    ):
        for side, tl_id in zip(SIDES, (it_id, al_id)):
            if tl_id is not None:
                votes[team_id][side][tl_id] += 1

    winners = {
        team_id: {
            side: min(counter, key=lambda uid: (-counter[uid], uid)) if counter else None
            for side, counter in sides.items()
        }
        for team_id, sides in votes.items()
    }
    users = User.objects.in_bulk(
        {uid for sides in winners.values() for uid in sides.values() if uid is not None}
    )
    return {
        team_id: {side: users.get(uid) for side, uid in sides.items()}
        for team_id, sides in winners.items()
    }


def italian_tl_user_ids(among=None):
    """Ids of every Manager, by the same rule as ``UserProfile.is_italian_tl``.

    A Manager is the reporting line above the people measured by the skills
    matrix and Ticket KPI, so both leave them out of rosters. Matches the role,
    the legacy flag, or having people who report to them.
    """
    users = User.objects.all()
    if among is not None:
        users = users.filter(id__in=among)
    return set(
        users.filter(
            Q(user_roles__role__code='italian_tl', user_roles__is_active=True)
            | Q(italian_team_members__isnull=False)
        ).values_list('id', flat=True)
    )


def albanian_tl_user_ids(among=None):
    """Ids of Line Managers (``role_codes`` holds ``albanian_tl``), optionally
    limited to ``among`` so a roster check never scans every profile."""
    from apps.users.models.core import UserProfile

    profiles = UserProfile.objects.all()
    if among is not None:
        profiles = profiles.filter(user_id__in=among)
    return {
        user_id
        for user_id, codes in profiles.values_list('user_id', 'role_codes')
        if 'albanian_tl' in (codes or [])
    }


def managed_member_ids_bulk(leader_ids, *, active_only: bool = False) -> dict[int, set[int]]:
    """``{leader_id: member_ids}`` in a fixed number of queries.

    Same source as ``UserProfile.get_team_member_ids()`` (direct italian/albanian
    FK only; teams are calendar-only), batched so a year with 30 pairs does not
    cost 60 queries, and so HBPR scope resolution stays flat at any number of
    assignments (2026-11-21). ``test_managed_members_match_core`` pins the parity.

    Lives in core because core services may not import a plugin; the year-close
    builder imports it from here.
    """
    from apps.users.models import UserProfile

    leader_ids = set(leader_ids)
    result: dict[int, set[int]] = {leader_id: set() for leader_id in leader_ids}
    if not leader_ids:
        return result

    for field in ('italian_tl_id', 'albanian_tl_id'):
        qs = UserProfile.objects.filter(**{f'{field}__in': leader_ids})
        if active_only:
            qs = qs.filter(user__is_active=True)
        for leader_id, user_id in qs.values_list(field, 'user_id'):
            result[leader_id].add(user_id)

    return result
