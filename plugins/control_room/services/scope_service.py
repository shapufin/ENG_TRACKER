"""
Scope service for the Control Room plugin.

Centralizes all access/scope resolution so viewsets and dashboard services
cannot drift. Every endpoint must go through here.

Critical invariant: an empty scope for a non-admin user means NO visibility,
NOT global visibility.
"""
from typing import Optional, Set

from django.contrib.auth.models import User
from django.db.models import Q

from plugins.control_room.models import ControlRoomAccess, ControlRoomTeamScope


def get_access_for_user(user: User) -> Optional[ControlRoomAccess]:
    """Return the user's ControlRoomAccess record, or None.

    Returns None if:
    - The user has no access record.
    - The user's access record is inactive.
    - The user's Django account is inactive.
    """
    if not user or not user.is_authenticated:
        return None
    if not user.is_active:
        return None
    return (
        ControlRoomAccess.objects
        .filter(user=user, is_active=True)
        .first()
    )


def can_access_dashboard(user: User) -> bool:
    """True if the user may open the Control Room dashboard at all.

    Admin/staff bypass; everyone else needs an active access record OR the
    ``cr_admin`` role (a CR admin without an access record still sees the
    dashboard scoped to their own team memberships).
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    if get_access_for_user(user) is not None:
        return True
    from core.mixins.permissions import is_cr_admin
    return is_cr_admin(user)


def can_manage_access(user: User) -> bool:
    """True if the user may create/modify/delete Control Room access & scopes.

    Admin/staff only. This is intentionally stricter than view access.
    """
    if not user or not user.is_authenticated:
        return False
    return user.is_staff or user.is_superuser


def get_allowed_team_ids(user: User) -> Optional[Set[int]]:
    """Return the set of team IDs the user may observe, or None for global.

    Returns:
        None  — user has global scope (admin/staff).
        set() — user has access but no teams assigned (empty scope = no data).
        {1,2} — user may observe exactly these teams.

    Callers MUST distinguish None (global) from set() (empty). Treating an
    empty set as global is the most dangerous permission bug in this plugin.
    """
    if not user or not user.is_authenticated:
        return set()
    if user.is_staff or user.is_superuser:
        return None  # global

    access = get_access_for_user(user)
    if access is not None:
        return set(
            ControlRoomTeamScope.objects
            .filter(access=access)
            .values_list('team_id', flat=True)
        )

    # CR admin without a ControlRoomAccess record: scope the dashboard to
    # the teams they are themselves a member of, mirroring a normal CR
    # user's visibility for their own team. An empty membership set is
    # treated as an empty scope (no data, NOT global) per the invariant.
    from core.mixins.permissions import is_cr_admin
    if is_cr_admin(user):
        from apps.users.models.core import TeamMembership
        return set(
            TeamMembership.objects
            .filter(user_profile__user=user)
            .values_list('team_id', flat=True)
            .distinct()
        )

    return set()  # no access record -> no data


def get_allowed_user_ids(user: User, team_ids: Optional[Set[int]] = None) -> Set[int]:
    """Return the set of Django user IDs whose standby logs the caller may see.

    Args:
        user: The requesting user.
        team_ids: Optional pre-resolved scope (from get_allowed_team_ids).
                  If None (admin/global), returns all user IDs that belong
                  to any team. If empty set, returns empty set.

    Uses TeamMembership (the real through table) — never ORM-filters the
    Python property `profile.team`.
    """
    from apps.users.models.core import TeamMembership

    if team_ids is None:
        # Global scope: all users who belong to at least one team.
        return set(
            TeamMembership.objects
            .values_list('user_profile__user_id', flat=True)
            .distinct()
        )

    if not team_ids:
        return set()

    return set(
        TeamMembership.objects
        .filter(team_id__in=team_ids)
        .values_list('user_profile__user_id', flat=True)
        .distinct()
    )


def get_calendar_excluded_user_ids() -> Set[int]:
    """Return active CR-only user IDs that must not appear in calendars.

    Control Room users share core team memberships so their standby shifts can
    be observed through the Control Room projection. Those memberships must
    not make CR-only identities visible in the normal calendar. Users with a
    higher role (TL, HR, staff, or superuser) retain normal calendar access.
    """
    from apps.users.models.core import Team, UserProfile

    access_user_ids = set(
        ControlRoomAccess.objects.filter(
            is_active=True,
            user__is_active=True,
            user__is_staff=False,
            user__is_superuser=False,
        ).values_list('user_id', flat=True)
    )
    if not access_user_ids:
        return set()

    elevated_user_ids = set(
        UserProfile.objects.filter(user_id__in=access_user_ids)
        .filter(
            Q(is_hr_user=True) | Q(role_codes__icontains='hr')
            | Q(is_italian_tl_role=True) | Q(role_codes__icontains='italian_tl')
            | Q(is_albanian_tl_role=True) | Q(role_codes__icontains='albanian_tl')
        )
        .values_list('user_id', flat=True)
    )
    elevated_user_ids.update(
        Team.objects.filter(team_leader_id__in=access_user_ids)
        .values_list('team_leader_id', flat=True)
    )
    elevated_user_ids.update(
        UserProfile.objects.filter(
            Q(italian_tl_id__in=access_user_ids)
            | Q(albanian_tl_id__in=access_user_ids)
        ).values_list('italian_tl_id', flat=True)
    )
    elevated_user_ids.update(
        UserProfile.objects.filter(
            Q(italian_tl_id__in=access_user_ids)
            | Q(albanian_tl_id__in=access_user_ids)
        ).values_list('albanian_tl_id', flat=True)
    )
    return access_user_ids - elevated_user_ids


def is_team_in_scope(user: User, team_id: int) -> bool:
    """True if the user may observe the given team.

    Admin/staff: always True.
    Otherwise: team_id must be in the user's allowed team set.
    """
    if user.is_staff or user.is_superuser:
        return True
    allowed = get_allowed_team_ids(user)
    return allowed is not None and team_id in allowed
