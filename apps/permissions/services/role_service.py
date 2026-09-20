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


_TL_ROLE_CODES = ('italian_tl', 'albanian_tl')


def get_tl_dependents(user, role_code: str):
    """Return UserProfiles whose italian_tl/albanian_tl FK still points at
    ``user`` for the given TL role_code ('italian_tl' or 'albanian_tl').

    UserProfile.is_team_leader/is_italian_tl/is_albanian_tl treat this FK as
    a live source of TL status (see apps/users/models/core.py) — it is not
    a stale cache, it's how the system decides "is this person currently
    functioning as a TL for someone." Revoking user's TL role while a
    dependent's FK still points at them leaves that dependent's TL
    unchanged in practice, so callers must check this before revoking and
    block/require reassignment first.
    """
    from apps.users.models.core import UserProfile

    if role_code not in _TL_ROLE_CODES:
        return UserProfile.objects.none()
    return UserProfile.objects.filter(**{role_code: user}).select_related('user')


class TeamLeaderRevokeBlockedError(Exception):
    """Raised by callers that can't return a structured HTTP response (e.g.
    the data importer) when find_blocked_tl_revocations finds dependents."""

    def __init__(self, blocked_revocations: list[dict]):
        self.blocked_revocations = blocked_revocations
        summary = '; '.join(
            f"{b['role']}: still assigned to "
            f"{', '.join(d['username'] for d in b['dependents'])}"
            for b in blocked_revocations
        )
        super().__init__(
            'Cannot revoke TL role while other users are still assigned to '
            'them: ' + summary
        )


def find_blocked_tl_revocations(user, new_state: dict) -> list[dict]:
    """The single source of truth for "would revoking user's TL role(s)
    leave a dependent's FK dangling."

    ``new_state`` maps a subset of {'italian_tl', 'albanian_tl'} to the role
    state the user WILL have after the pending change — a role_code absent
    from ``new_state`` is treated as "not touched by this request" and is
    never checked. Compares against the user's CURRENT effective status via
    the ``is_italian_tl``/``is_albanian_tl`` properties (apps/users/models/
    core.py), which already account for role_codes as well as the legacy
    is_italian_tl_role/is_albanian_tl_role flags — a role granted via
    assign_role() directly (bypassing the legacy flag) is caught too.

    Every caller that can revoke a TL role — apps/users/viewsets.py's
    bulk_update and update_user, and apps/users/services/user_creation.py's
    update_user_profile (used by the data importer) — must call this before
    mutating anything, so a revoke initiated through any path is checked
    the same way.
    """
    profile = user.profile
    current = {'italian_tl': profile.is_italian_tl, 'albanian_tl': profile.is_albanian_tl}
    blocked = []
    for role_code in _TL_ROLE_CODES:
        if role_code not in new_state:
            continue
        if not (current[role_code] and not new_state[role_code]):
            continue
        dependents = list(get_tl_dependents(user, role_code))
        if dependents:
            blocked.append({
                'user_id': user.id,
                'username': user.username,
                'role': role_code,
                'dependents': [
                    {'profile_id': d.id, 'user_id': d.user_id, 'username': d.user.username}
                    for d in dependents
                ],
            })
    return blocked


def find_blocked_tl_revocations_bulk(candidates, new_state: dict) -> list[dict]:
    """Batched variant of find_blocked_tl_revocations for many users checked
    against the same new_state — apps/users/viewsets.py's bulk_update
    revokes the same role field uniformly across every selected user, so
    this runs 2 queries total (one per role_code being revoked) instead of
    one get_tl_dependents query per candidate user.
    """
    from apps.users.models.core import UserProfile

    if not candidates:
        return []
    candidate_ids = [u.id for u in candidates]
    profiles_by_user_id = {
        p.user_id: p
        for p in UserProfile.objects.filter(user_id__in=candidate_ids).select_related('user')
    }
    blocked = []
    for role_code in _TL_ROLE_CODES:
        if role_code not in new_state or new_state[role_code]:
            continue
        current_attr = 'is_italian_tl' if role_code == 'italian_tl' else 'is_albanian_tl'
        revoking_user_ids = [
            uid for uid, profile in profiles_by_user_id.items()
            if getattr(profile, current_attr)
        ]
        if not revoking_user_ids:
            continue
        dependents_by_leader: dict[int, list] = {}
        for dependent in UserProfile.objects.filter(
            **{f'{role_code}_id__in': revoking_user_ids}
        ).select_related('user'):
            leader_id = getattr(dependent, f'{role_code}_id')
            dependents_by_leader.setdefault(leader_id, []).append(dependent)
        for uid in revoking_user_ids:
            dependents = dependents_by_leader.get(uid)
            if dependents:
                profile = profiles_by_user_id[uid]
                blocked.append({
                    'user_id': uid,
                    'username': profile.user.username,
                    'role': role_code,
                    'dependents': [
                        {
                            'profile_id': d.id,
                            'user_id': d.user_id,
                            'username': d.user.username,
                        }
                        for d in dependents
                    ],
                })
    return blocked


@transaction.atomic
def revoke_role(user, role_code: str, team=None) -> int:
    """Deactivate matching role assignments while preserving assignment history."""
    role = Role.objects.get(code=role_code)
    updated = UserRole.objects.filter(
        user=user, role=role, team=team, is_active=True
    ).update(is_active=False)
    _refresh_role_cache(user)
    return updated
