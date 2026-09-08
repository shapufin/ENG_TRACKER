"""
Audience resolution for published custom org charts.

The resolver is the single source of truth for whether a user may view a
custom chart. It is used by the public viewer list/detail endpoints, the
admin preview endpoint, and publish validation.

Rules (plan §7.1):
  * ``all_authenticated`` — any authenticated user;
  * ``selected`` — user matches any selected role OR any selected resource group;
  * ``private_admin`` — staff/superuser only;
  * an empty selected audience is invalid and is not interpreted as public.

Legacy profile flags are checked only for the canonical role codes as a
compatibility fallback when the ``role_codes`` denormalized cache does not
include them.
"""
from __future__ import annotations

from typing import Optional, Set

from django.contrib.auth.models import User
from django.db.models import Q

from apps.permissions.models import UserGroup
from apps.permissions.services.role_service import get_user_roles
from core.mixins.permissions import is_cr_admin
from plugins.organigrama.models import OrgChart

__all__ = [
    "user_can_view_chart",
    "list_visible_chart_ids",
    "get_user_role_codes",
    "get_user_group_ids",
]


def get_user_role_codes(user: User) -> Set[str]:
    """Return canonical role codes for a user, including a compatibility fallback."""
    if not user or not getattr(user, "is_authenticated", True):
        return set()
    codes = set(get_user_roles(user))
    profile = getattr(user, "profile", None)
    if profile is not None:
        if getattr(profile, "is_italian_tl_role", False):
            codes.add("italian_tl")
        if getattr(profile, "is_albanian_tl_role", False):
            codes.add("albanian_tl")
        if getattr(profile, "is_hr_user", False):
            codes.add("hr")
    # cr_admin uses the same helper that the permission system uses; it is
    # also a canonical role code.
    if is_cr_admin(user):
        codes.add("cr_admin")
    # Every authenticated user is an employee for audience purposes.
    codes.add("employee")
    return codes


def get_user_group_ids(user: User) -> Set[int]:
    """Return resource-group IDs the user belongs to."""
    if not user or not getattr(user, "is_authenticated", True):
        return set()
    return set(
        UserGroup.objects.filter(user=user, is_deleted=False).values_list("group_id", flat=True)
    )


def _has_role_match(selected_role_codes: Set[str], user_role_codes: Set[str]) -> bool:
    if not selected_role_codes:
        return False
    return bool(selected_role_codes & user_role_codes)


def _has_group_match(selected_group_ids: Set[int], user_group_ids: Set[int]) -> bool:
    if not selected_group_ids:
        return False
    return bool(selected_group_ids & user_group_ids)


def _selected_audience(chart: OrgChart):
    """Return selected (role_codes, group_ids) from the audience_roles and audience_groups.
    
    IMPORTANT: This function assumes prefetch_related("audience_roles", "audience_groups")
    was called on the chart queryset. If called on a chart without prefetch, this will
    issue separate queries for each call (N+1 if called in a loop).
    
    All call sites (user_can_view_chart, list_visible_chart_ids) ensure prefetch is applied.
    """
    role_codes = set(r.role_code for r in chart.audience_roles.all())
    group_ids = set(g.group_id for g in chart.audience_groups.all())
    return role_codes, group_ids


def user_can_view_chart(
    user: User,
    chart: OrgChart,
    *,
    as_staff: bool = False,
    user_role_codes: Optional[Set[str]] = None,
    user_group_ids: Optional[Set[int]] = None,
) -> bool:
    """Return whether ``user`` is allowed to view ``chart``.

    ``as_staff=True`` bypasses the audience check for staff/superuser preview
    and admin directory visibility (the caller still must enforce the
    staff-only gate).
    """
    if not user or not getattr(user, "is_authenticated", True):
        return False
    if as_staff and (user.is_staff or user.is_superuser):
        return True
    if chart.status != "published":
        return False

    mode = chart.audience_mode
    if mode == "all_authenticated":
        return True
    if mode == "private_admin":
        return user.is_staff or user.is_superuser

    # mode == "selected"
    selected_role_codes, selected_group_ids = _selected_audience(chart)
    if not selected_role_codes and not selected_group_ids:
        return False

    if user_role_codes is None:
        user_role_codes = get_user_role_codes(user)
    if _has_role_match(selected_role_codes, user_role_codes):
        return True

    if user_group_ids is None:
        user_group_ids = get_user_group_ids(user)
    return _has_group_match(selected_group_ids, user_group_ids)


def list_visible_chart_ids(user: User) -> Set[int]:
    """Return the IDs of all published custom charts the user may view.

    Uses query-level filtering to avoid materializing all published charts
    into memory, which would cause unbounded memory growth with large chart counts.

    Parity with ``user_can_view_chart``: staff/superusers see ``private_admin``
    charts (the resolver returns True for them on that mode), so the directory
    must include those charts for staff too.
    """
    if not user or not getattr(user, "is_authenticated", True):
        return set()

    user_role_codes = get_user_role_codes(user)
    user_group_ids = get_user_group_ids(user)

    # Query-level filtering instead of materializing all charts
    q_filter = Q(status="published", audience_mode="all_authenticated")

    if user.is_staff or user.is_superuser:
        q_filter |= Q(status="published", audience_mode="private_admin")

    if user_role_codes:
        q_filter |= Q(
            status="published",
            audience_mode="selected",
            audience_roles__role_code__in=user_role_codes,
        )

    if user_group_ids:
        q_filter |= Q(
            status="published",
            audience_mode="selected",
            audience_groups__group_id__in=user_group_ids,
        )

    return set(
        OrgChart.objects.filter(q_filter).distinct().values_list("id", flat=True)
    )
