"""HBPR (HR Business Partner, Italy) role helpers and population scope.

The HBPR population is *computed*, never stored: every active holder of the
``italian_tl`` role (database role or legacy flag), plus everyone those TLs
manage per ``UserProfile.get_team_member_ids()`` — direct ``italian_tl`` /
``albanian_tl`` FK reports, members of teams the TL belongs to, and members of
teams the TL leads. The ``italian_tl`` FK on its own is NOT used: every profile
carries both TL FKs, so it would match nearly everyone.

All HBPRs share one population. Scope is built in exactly one place
(``_population``) so a per-HBPR assignment table could replace it later.

This module is core: it must never import from ``plugins.*``.
"""
from dataclasses import dataclass

from django.contrib.auth import get_user_model
from django.db.models import Q

from apps.permissions.services.role_service import has_role

User = get_user_model()

HBPR_ROLE_CODE = 'hbpr'
_SCOPE_ATTR = '_hbpr_scope'


@dataclass(frozen=True)
class HbprScope:
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


def _population() -> tuple[frozenset, frozenset]:
    """Return ``(tl_ids, member_ids)`` for the Italian population, unfiltered."""
    from apps.users.models.core import Team, UserProfile

    tl_ids = frozenset(
        User.objects.filter(is_active=True).filter(
            Q(user_roles__is_active=True, user_roles__role__code='italian_tl')
            | Q(profile__is_italian_tl_role=True)
        ).values_list('id', flat=True).distinct()
    )
    if not tl_ids:
        return frozenset(), frozenset()

    team_ids = set(
        Team.objects.filter(
            Q(team_leader_id__in=tl_ids) | Q(user_memberships__user_profile__user_id__in=tl_ids)
        ).values_list('id', flat=True)
    )
    filters = Q(italian_tl_id__in=tl_ids) | Q(albanian_tl_id__in=tl_ids)
    if team_ids:
        filters |= Q(teams__id__in=team_ids)
    member_ids = frozenset(
        UserProfile.objects.filter(filters, user__is_active=True)
        .values_list('user_id', flat=True).distinct()
    )
    return tl_ids, member_ids


def get_hbpr_scope(user) -> 'HbprScope | None':
    """Scope for an HBPR viewer, or ``None`` if ``user`` is not an HBPR.

    The viewer is removed from their own scope so an HBPR can never act on
    records about themselves. Memoised on the user instance for the request.
    """
    if not is_hbpr(user):
        return None
    cached = getattr(user, _SCOPE_ATTR, None)
    if cached is not None:
        return cached
    tl_ids, member_ids = _population()
    scope = HbprScope(
        tl_ids=tl_ids - {user.id},
        member_ids=member_ids - {user.id},
    )
    setattr(user, _SCOPE_ATTR, scope)
    return scope


def hbpr_user_ids_for(subject_user, owner_id=None) -> list:
    """Ids of active HBPR users who cover ``subject_user`` (notification
    recipients). Empty when the subject is outside the Italian population.
    The subject is never their own recipient. When ``owner_id`` (the TL who
    wrote the record) is given it must be an Italian TL too, mirroring the
    read rule: a record HBPRs cannot open must not notify them."""
    tl_ids, member_ids = _population()
    if subject_user.id not in tl_ids and subject_user.id not in member_ids:
        return []
    if owner_id is not None and owner_id not in tl_ids:
        return []
    return list(
        User.objects.filter(
            is_active=True,
            user_roles__is_active=True,
            user_roles__role__code=HBPR_ROLE_CODE,
        )
        .exclude(id=subject_user.id)
        .values_list('id', flat=True)
        .distinct()
    )
