"""Who a team leader may score in this plugin."""
from apps.users.models.core import UserProfile


def scoreable_member_ids(user):
    """`get_team_member_ids()` minus Albanian TLs.

    An Albanian TL is governed by their HBPR through evidence; an Italian TL who
    shares a team with one (or is their direct `italian_tl`) must not open PIPs,
    EPR cycles, flags or nominations on them, nor have them in team metrics.
    """
    ids = user.profile.get_team_member_ids()
    if not ids:
        return ids
    al_tl_ids = {
        user_id
        for user_id, codes in UserProfile.objects.filter(user_id__in=ids)
        .values_list('user_id', 'role_codes')
        if 'albanian_tl' in (codes or [])
    }
    return ids - al_tl_ids
