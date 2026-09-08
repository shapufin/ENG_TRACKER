"""Role assignment and lookup helpers.

UserRole is the authoritative source for role membership. The profile
``role_codes`` field is maintained as a denormalized read cache by signals.
"""

from django.contrib.auth import get_user_model
from django.db import transaction

from apps.permissions.models import Role, UserRole

User = get_user_model()


def get_user_roles(user) -> set[str]:
    """Return active role codes for a user."""
    if not user or not getattr(user, "is_authenticated", True):
        return set()
    cached = getattr(getattr(user, "profile", None), "role_codes", None)
    if cached is not None:
        return set(cached)
    return set(
        UserRole.objects.filter(user=user, is_active=True)
        .values_list("role__code", flat=True)
    )


def has_role(user, role_code: str) -> bool:
    """Return whether the user has an active role code."""
    return role_code in get_user_roles(user)


def _refresh_role_cache(user) -> None:
    """Synchronize the profile role-code cache from active assignments."""
    codes = sorted(
        UserRole.objects.filter(user=user, is_active=True)
        .values_list("role__code", flat=True)
        .distinct()
    )
    profile = getattr(user, "profile", None)
    if profile is not None and profile.role_codes != codes:
        profile.role_codes = codes
        profile.save(update_fields=["role_codes"])


@transaction.atomic
def assign_role(user, role_code: str, team=None) -> UserRole:
    """Assign or reactivate a role for a user, optionally scoped to a team."""
    role = Role.objects.get(code=role_code)
    assignment, _ = UserRole.objects.get_or_create(
        user=user,
        role=role,
        team=team,
        defaults={"is_active": True},
    )
    if not assignment.is_active:
        assignment.is_active = True
        assignment.save(update_fields=["is_active"])
    return assignment


@transaction.atomic
def revoke_role(user, role_code: str, team=None) -> int:
    """Deactivate matching role assignments while preserving assignment history."""
    role = Role.objects.get(code=role_code)
    updated = UserRole.objects.filter(
        user=user, role=role, team=team, is_active=True
    ).update(is_active=False)
    _refresh_role_cache(user)
    return updated
