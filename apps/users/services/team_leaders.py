"""Display-only Italian/Albanian TL per team, derived from its members.

Members of a team normally share one Italian and one Albanian TL, so the
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


def italian_tl_user_ids():
    """Ids of every Italian team leader, by the same rule as ``UserProfile.is_italian_tl``.

    An Italian TL is the reporting line above the people measured by the skills
    matrix and Ticket KPI, so both leave them out of rosters. Matches the role,
    the legacy flag, or having people who report to them.
    """
    return set(
        User.objects.filter(
            Q(profile__is_italian_tl_role=True)
            | Q(user_roles__role__code='italian_tl', user_roles__is_active=True)
            | Q(italian_team_members__isnull=False)
        ).values_list('id', flat=True)
    )
