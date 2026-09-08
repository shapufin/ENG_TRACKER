"""TL approval-period close and source processing-period assignment services."""
from __future__ import annotations

from datetime import date
from typing import Any

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from core.mixins.permissions import has_team_leader_role
from apps.users.models import (
    ApprovalPeriodBoundary,
    ApprovalPeriodClose,
    ApprovalPeriodCloseMember,
    UserProfile,
)


def normalize_period(value: date | str) -> date:
    """Normalize any date-like value to the first day of its calendar month."""
    if isinstance(value, str):
        value = date.fromisoformat(value)
    return value.replace(day=1)


def next_period(period: date) -> date:
    """Return the first day of the following calendar month."""
    if period.month == 12:
        return date(period.year + 1, 1, 1)
    return date(period.year, period.month + 1, 1)


def _get_boundary_locked(period: date) -> ApprovalPeriodBoundary:
    """Get and lock the per-period coordination row.

    ``get_or_create`` uses an internal savepoint to handle two requests trying
    to bootstrap the same unique period row. The second query is then locked
    explicitly; a newly-created row is not assumed to be locked.
    """
    period = normalize_period(period)
    boundary, _ = ApprovalPeriodBoundary.objects.get_or_create(period=period)
    return ApprovalPeriodBoundary.objects.select_for_update().get(pk=boundary.pk)


def _managed_user_ids(actor) -> set[int]:
    profile = getattr(actor, 'profile', None)
    if profile is None:
        return set()
    return set(profile.get_team_member_ids())


def finalize_period(actor, period: date) -> tuple[ApprovalPeriodClose, bool]:
    """Finalize one period for the actor's current managed scope atomically.

    Returns ``(close, created)``. Repeating the same request for the same actor
    and period is idempotent and returns the original immutable close snapshot.
    """
    if not (actor.is_staff or actor.is_superuser or has_team_leader_role(actor)):
        raise PermissionDenied('Only team leaders and administrators can finalize approval periods.')

    period = normalize_period(period)
    scope_key = f'managed-user:{actor.pk}'

    with transaction.atomic():
        boundary = _get_boundary_locked(period)
        existing = (
            ApprovalPeriodClose.objects.select_for_update()
            .filter(boundary=boundary, scope_key=scope_key)
            .first()
        )
        if existing is not None:
            return existing, False

        close = ApprovalPeriodClose.objects.create(
            boundary=boundary,
            closed_at=timezone.now(),
            closed_by=actor,
            scope_type='managed_scope',
            scope_key=scope_key,
        )

        member_ids = _managed_user_ids(actor)
        profiles = {
            profile.user_id: profile
            for profile in UserProfile.objects.filter(
                user_id__in=member_ids,
            ).prefetch_related('team_memberships__team')
        }
        members = []
        for user_id in sorted(member_ids):
            profile = profiles.get(user_id)
            source_team = profile.get_primary_team() if profile else None
            members.append(
                ApprovalPeriodCloseMember(
                    close=close,
                    user_id=user_id,
                    source_team=source_team,
                )
            )
        ApprovalPeriodCloseMember.objects.bulk_create(members)

    return close, True


def get_actor_close(actor, period: date) -> ApprovalPeriodClose | None:
    """Return the actor's close snapshot for a period, if it exists."""
    period = normalize_period(period)
    return (
        ApprovalPeriodClose.objects.select_related('boundary', 'closed_by')
        .filter(
            boundary__period=period,
            scope_key=f'managed-user:{actor.pk}',
        )
        .first()
    )


def resolve_processing_assignment(user, work_date: date) -> dict[str, Any]:
    """Assign a source entry to its requested payroll processing period.

    The boundary row is locked before the submission timestamp is captured, so
    a concurrent finalize/create race has a deterministic serialization order.
    Payroll resolution of an already-finalized target is deliberately outside
    this core service.
    """
    base_period = normalize_period(work_date)
    with transaction.atomic():
        boundary = _get_boundary_locked(base_period)
        submitted_at = timezone.now()
        close = (
            ApprovalPeriodClose.objects.filter(
                boundary=boundary,
                members__user_id=user.pk,
                closed_at__lte=submitted_at,
            )
            .order_by('closed_at', 'pk')
            .first()
        )
        requested_period = next_period(base_period) if close else base_period
        return {
            'submitted_at': submitted_at,
            'requested_processing_period': requested_period,
            'approval_period_close': close,
        }


def period_is_closed_for_user(user, work_date: date) -> bool:
    """Return whether the user's work-date period is closed in any scope."""
    return ApprovalPeriodCloseMember.objects.filter(
        user_id=user.pk,
        close__boundary__period=normalize_period(work_date),
    ).exists()
