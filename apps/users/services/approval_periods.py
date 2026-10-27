"""TL approval-period close and source processing-period assignment services."""
from __future__ import annotations

import logging
import time
from datetime import date, datetime
from typing import Any

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from core.mixins.permissions import has_team_leader_role
from core.utils.timezone_local import business_tz
from apps.users.models import (
    ApprovalPeriodBoundary,
    ApprovalPeriodClose,
    ApprovalPeriodCloseMember,
    ClosedYear,
    UserProfile,
)

logger = logging.getLogger(__name__)

# A closed year is read once per process per year for this long. The window is
# deliberately short: closing a year happens once a year, and a worker that
# has not noticed yet must not keep accepting edits for minutes. Overridable
# through settings (the e2e suite sets 0 so a close is visible immediately).
DEFAULT_CLOSED_YEAR_CACHE_TTL_SECONDS = 60
_closed_year_cache: dict[int, tuple[bool, float]] = {}


def _closed_year_cache_ttl() -> float:
    from django.conf import settings

    return getattr(
        settings, 'CLOSED_YEAR_CACHE_TTL_SECONDS', DEFAULT_CLOSED_YEAR_CACHE_TTL_SECONDS
    )


def clear_closed_year_cache() -> None:
    """Forget cached closed-year lookups (call after closing or reopening one).

    Tests must call this too: Django's ``TestCase`` rolls the row back without
    firing signals, so a cached ``True`` would outlive the test that set it.
    """
    _closed_year_cache.clear()


def is_year_closed(year: int) -> bool:
    """Whether ``year`` is frozen. Cached per process for 60 seconds."""
    now = time.monotonic()
    cached = _closed_year_cache.get(year)
    if cached is not None and now - cached[1] < _closed_year_cache_ttl():
        return cached[0]
    closed = ClosedYear.objects.filter(year=year).exists()
    _closed_year_cache[year] = (closed, now)
    return closed


def _as_work_date(value) -> date | None:
    """Normalise a work date: importers carry ``date`` objects, but a direct
    ``commit_row`` caller can hand over the raw ISO cell text."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return date.fromisoformat(value.strip()[:10])
        except ValueError:
            return None
    return None


def closed_year_error(work_date) -> str | None:
    """Message naming the closed year, or ``None`` when ``work_date`` is writable."""
    work_date = _as_work_date(work_date)
    if work_date is None or not is_year_closed(work_date.year):
        return None
    return year_lock_message(work_date.year)


def year_lock_message(year: int) -> str:
    """The one wording every write path uses when a year is frozen."""
    return (
        f'{year} is closed: its overtime and standby records are frozen. '
        f'A superuser can reopen it with `manage.py reopen_year --year {year} --reason "..."`.'
    )


def closed_year_of(obj) -> int | None:
    """The closed year that freezes this record, if any (``None`` = writable)."""
    work_date = _as_work_date(getattr(obj, 'date', None))
    if work_date is None or not is_year_closed(work_date.year):
        return None
    return work_date.year


def assert_year_open(work_date: date | None) -> None:
    """Raise a DRF ``ValidationError`` when ``work_date`` falls in a closed year."""
    message = closed_year_error(work_date)
    if message:
        raise ValidationError(message)


def close_year(year: int, *, actor=None, snapshot_ref: str = '') -> ClosedYear:
    """Freeze ``year``. Idempotent: re-closing returns the existing marker.

    The year-close engine (Y3) is the only caller that should set
    ``snapshot_ref``, and only after every snapshot file is ready.
    """
    closed, created = ClosedYear.objects.get_or_create(
        year=year,
        defaults={'closed_at': timezone.now(), 'closed_by': actor, 'snapshot_ref': snapshot_ref},
    )
    if not created and snapshot_ref and closed.snapshot_ref != snapshot_ref:
        closed.snapshot_ref = snapshot_ref
        closed.save(update_fields=['snapshot_ref', 'updated_at'])
    if created:
        record_year_event(actor, 'UPDATE', year, 'close_year', extra={'snapshot_ref': snapshot_ref})
    clear_closed_year_cache()
    return closed


def reopen_year(year: int, *, actor=None, reason: str = '') -> bool:
    """Unfreeze ``year``. Returns whether a marker was removed.

    The reason is required: reopening a frozen year is an audit event, not a
    routine action.
    """
    if not reason or not reason.strip():
        raise ValidationError('A reason is required to reopen a year.')
    deleted, _ = ClosedYear.objects.filter(year=year).delete()
    if deleted:
        record_year_event(actor, 'DELETE', year, 'reopen_year', extra={'reason': reason.strip()})
    clear_closed_year_cache()
    return bool(deleted)


def record_year_event(actor, action: str, year: int, operation: str, extra: dict | None = None) -> None:
    """Write a year-close event to the audit log. Never blocks the action."""
    try:
        from apps.reports.models import AuditLog

        AuditLog.objects.create(
            user=actor if getattr(actor, 'pk', None) else None,
            action=action,
            model_name='closedyear',
            object_id=str(year),
            object_repr=f'Closed year {year}',
            extra_data={'operation': operation, **(extra or {})},
        )
    except Exception:
        logger.warning('Could not record %s audit event for %s', operation, year, exc_info=True)


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


def work_date_cutoff(work_date: date) -> datetime:
    """Start of the 2nd of the month after the work date's month, in the business timezone."""
    following = next_period(normalize_period(work_date))
    return datetime(following.year, following.month, 2, tzinfo=business_tz())


def is_work_date_open(work_date: date, now: datetime | None = None) -> bool:
    """Whether OT/standby records may still be created for this work date."""
    now = now or timezone.now()
    return now.astimezone(business_tz()) < work_date_cutoff(work_date)


def assert_work_date_open(work_date: date, now: datetime | None = None) -> None:
    """Refuse a work date that is in a closed year or a closed month.

    Every write path that validates a work date (overtime and standby create,
    and update when the date changes) goes through here, so the closed-year
    lock reaches all of them without touching each serializer again.
    """
    assert_year_open(work_date)
    if not is_work_date_open(work_date, now=now):
        raise ValidationError(
            f'Entries for {normalize_period(work_date):%B %Y} are closed. Records for a month '
            f'can be added until the 2nd of the following month ({business_tz()}).'
        )


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

        member_ids = _managed_user_ids(actor)
        if not member_ids:
            raise ValidationError('There are no team members in your scope to finalize.')
        close = ApprovalPeriodClose.objects.create(
            boundary=boundary,
            closed_at=timezone.now(),
            closed_by=actor,
            scope_type='managed_scope',
            scope_key=scope_key,
        )

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
                    source_team_name=source_team.name if source_team else '',
                    source_team_code=source_team.code if source_team else '',
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
