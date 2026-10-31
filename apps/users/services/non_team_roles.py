"""Who legitimately sits outside every team: HR, HBPR, Control Room and admin roles.

Read from all three sources the Admin Users role tabs use: the ``role_codes``
cache, the legacy ``is_hr_user`` flag (the legacy update path sets it without
refreshing the cache) and active ``UserRole`` rows. A new place that asks "is
this person a non-team role" must not read the cache alone.
"""
from django.db.models import Q

from apps.permissions.models import UserRole

NON_TEAM_ROLES = ('hr', 'hbpr', 'cr_admin', 'admin')


def non_team_user_q(prefix=''):
    """``Q`` matching non-team users, optionally reached through ``prefix``.

    ``prefix=''`` is a ``User`` queryset; ``prefix='userprofile__user__'``
    reaches the same users from a ``UserProfile``-rooted queryset.
    """
    q = Q(**{f'{prefix}profile__is_hr_user': True}) | Q(
        **{
            f'{prefix}pk__in': UserRole.objects.filter(
                is_active=True, role__code__in=NON_TEAM_ROLES
            ).values('user_id')
        }
    )
    # role_codes__icontains is SQLite-compatible (no JSON __contains). Safe for the current
    # codes: 'hr' is not a substring of 'hbpr'/'cr_admin'/'admin'/'employee'/'italian_tl'.
    for role in NON_TEAM_ROLES:
        q |= Q(**{f'{prefix}profile__role_codes__icontains': role})
    return q
