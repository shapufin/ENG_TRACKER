"""Who legitimately sits outside every team: HR, HBPR, Control Room and admin roles.

Read from active ``UserRole`` rows, the same source the Admin Users role tabs use. The ``role_codes`` cache is not read: it
is a derived copy that can lag behind a grant, and a substring match on it can
see ``xhr`` as ``hr`` (audithandover.md S2).
"""
from django.db.models import Q

from apps.permissions.services.role_service import users_with_role_q

NON_TEAM_ROLES = ('hr', 'hbpr', 'cr_admin', 'admin')


def non_team_user_q(prefix=''):
    """``Q`` matching non-team users, optionally reached through ``prefix``.

    ``prefix=''`` is a ``User`` queryset; ``prefix='userprofile__user__'``
    reaches the same users from a ``UserProfile``-rooted queryset.
    """
    q = Q()
    for role in NON_TEAM_ROLES:
        q |= users_with_role_q(role, prefix=prefix)
    return q
