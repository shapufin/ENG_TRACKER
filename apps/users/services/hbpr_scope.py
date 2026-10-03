"""HBPR (HR Business Partner, Italy) role helpers and assignment scope.

Scope is **explicit, not computed**: an HBPR sees exactly the Albanian TLs they
have an open ``HbprAlbanianTlAssignment`` for, plus those TLs' current
``UserProfile.get_team_member_ids()`` union. There is no global "all Italian
TLs" population any more — the assignment table is the single source of truth.

This module is core: it must never import from ``plugins.*``.
"""
from dataclasses import dataclass

from django.contrib.auth import get_user_model

from apps.permissions.services.role_service import has_role

User = get_user_model()

HBPR_ROLE_CODE = 'hbpr'
_SCOPE_ATTR = '_hbpr_scope'


@dataclass(frozen=True)
class HbprScope:
    assignment_ids: frozenset
    tl_ids: frozenset
    member_ids: frozenset

    @property
    def user_ids(self) -> frozenset:
        return self.tl_ids | self.member_ids

    def has_user(self, user_id) -> bool:
        return user_id in self.tl_ids or user_id in self.member_ids

    def has_tl(self, user_id) -> bool:
        return user_id in self.tl_ids


def is_hbpr(user) -> bool:
    """True only for an active ``hbpr`` role. Staff/superuser do NOT imply it,
    and a stale token claim is never consulted: the DB-backed role cache is."""
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    return has_role(user, HBPR_ROLE_CODE)


def _assignment_population(hbpr) -> tuple[frozenset, frozenset, frozenset]:
    """Return ``(assignment_ids, tl_ids, member_ids)`` for one HBPR.

    Only *open* assignments whose AL TL is active count. ``member_ids`` is the
    union of each assigned AL TL's ``get_team_member_ids()`` (which does not
    itself filter by ``is_active``), minus the TLs themselves and minus
    deactivated users — mirroring the old population's active-only rule.
    """
    from apps.users.services.hbpr_assignments import (
        active_assignments_for_hbpr,
        today,
    )

    # `on_date=today()` so a FUTURE-dated assignment grants no scope until it
    # starts; open-but-not-yet-effective rows must not leak data early.
    assignments = [
        a for a in active_assignments_for_hbpr(hbpr, on_date=today())
        if a.albanian_tl.is_active
    ]
    if not assignments:
        return frozenset(), frozenset(), frozenset()

    assignment_ids = frozenset(a.id for a in assignments)
    tl_ids = frozenset(a.albanian_tl_id for a in assignments)
    member_ids: set = set()
    for assignment in assignments:
        profile = getattr(assignment.albanian_tl, 'profile', None)
        if profile is not None:
            member_ids |= profile.get_team_member_ids()
    member_ids -= tl_ids
    if member_ids:
        active_ids = set(
            User.objects.filter(id__in=member_ids, is_active=True).values_list(
                'id', flat=True
            )
        )
        member_ids &= active_ids
    return assignment_ids, tl_ids, frozenset(member_ids)


def get_hbpr_scope(user) -> 'HbprScope | None':
    """Scope for an HBPR viewer, or ``None`` if ``user`` is not an HBPR.

    An HBPR with no open assignments gets an *empty* scope (not ``None``): they
    are still an HBPR, they just cover nobody. The viewer is removed from their
    own scope so an HBPR can never act on records about themselves. Memoised on
    the user instance for the request.
    """
    if not is_hbpr(user):
        return None
    cached = getattr(user, _SCOPE_ATTR, None)
    if cached is not None:
        return cached
    assignment_ids, tl_ids, member_ids = _assignment_population(user)
    scope = HbprScope(
        assignment_ids=assignment_ids,
        tl_ids=tl_ids - {user.id},
        member_ids=member_ids - {user.id},
    )
    setattr(user, _SCOPE_ATTR, scope)
    return scope


def hbpr_user_ids_for(subject_user, owner_id=None) -> list:
    """Ids of active HBPR users who cover a record (notification recipients).

    ``owner_id`` is the AL TL who owns the record. The covering HBPR is the
    owner of that TL's open assignment. Returns ``[]`` when the owner has no
    open assignment, the HBPR is inactive, or the subject is neither the owner
    nor one of the owner's current team members — mirroring the read rule, so a
    record the HBPR cannot open never notifies them. The subject is never their
    own recipient.
    """
    if owner_id is None:
        return []
    from apps.users.services.hbpr_assignments import (
        active_assignment_for_tl,
        today,
    )

    assignment = active_assignment_for_tl(owner_id, on_date=today())
    if assignment is None or not assignment.hbpr.is_active:
        return []
    if not assignment.albanian_tl.is_active:
        return []
    if subject_user.id == assignment.hbpr_id:
        return []
    profile = getattr(assignment.albanian_tl, 'profile', None)
    if profile is None:
        return []
    if subject_user.id != owner_id and subject_user.id not in profile.get_team_member_ids():
        return []
    return [assignment.hbpr_id]


def hbpr_user_ids_covering(subject_user) -> list:
    """Ids of active HBPR users whose assigned Albanian TLs cover ``subject_user``.

    For records with no owning-TL column (an employee's EPR cycle): scope reaches
    a member through the direct FK *and* a shared team, so the owner is found by
    asking each open assignment, never from the direct FK alone.
    """
    from apps.users.models.hbpr import HbprAlbanianTlAssignment
    from apps.users.services.hbpr_assignments import today

    owner_ids = HbprAlbanianTlAssignment.objects.filter(
        effective_to__isnull=True, effective_from__lte=today(),
    ).values_list('albanian_tl_id', flat=True)
    covering: list = []
    for owner_id in owner_ids:
        for hbpr_id in hbpr_user_ids_for(subject_user, owner_id):
            if hbpr_id not in covering:
                covering.append(hbpr_id)
    return covering
