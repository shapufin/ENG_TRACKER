"""Who a team leader may score in this plugin."""
from apps.users.services.team_leaders import albanian_tl_user_ids, italian_tl_user_ids


def scoreable_member_ids(user):
    """`get_team_member_ids()` minus Managers and Line Managers.

    Leaders are governed through evidence (a Line Manager by their HBPR), never
    scored: a Manager or Line Manager who reports to the viewer must not be the
    subject of PIPs, EPR cycles, flags or nominations, nor sit in team metrics.
    """
    profile = user.profile
    cached = getattr(profile, '_scoreable_ids', None)
    if cached is not None:
        return cached
    ids = profile.get_team_member_ids()
    if not ids:
        return ids
    profile._scoreable_ids = ids - albanian_tl_user_ids(among=ids) - italian_tl_user_ids(among=ids)
    return profile._scoreable_ids
