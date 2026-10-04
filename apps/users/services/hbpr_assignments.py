"""Transactional lifecycle for HBPR ↔ Albanian TL assignments.

All writes funnel through this service so the one-open-assignment rule and
overlap rejection are enforced with row locks, not serializer-only checks.
"""

from __future__ import annotations

from datetime import date, timedelta

from dateutil.relativedelta import relativedelta
from django.apps import apps
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.permissions.services.role_service import has_role
from apps.users.models.hbpr import HbprAlbanianTlAssignment

User = get_user_model()

CADENCES = {"weekly", "biweekly", "monthly"}

# Ended assignments are audit history, but evidence-free history does not need
# to live forever: rows whose last day in effect is older than this window are
# deleted. Evidence-bearing rows are never touched — their FK is PROTECT.
ARCHIVE_RETENTION_MONTHS = 6


class AssignmentError(Exception):
    """Raised when an assignment write violates a domain rule."""


def _validate_participants(hbpr, albanian_tl):
    if not hbpr or not has_role(hbpr, "hbpr"):
        raise AssignmentError("hbpr must hold the hbpr role.")
    if not albanian_tl or not has_role(albanian_tl, "albanian_tl"):
        raise AssignmentError("albanian_tl must hold the albanian_tl role.")


def _validate_cadence(cadence):
    if cadence not in CADENCES:
        raise AssignmentError(f"cadence must be one of {sorted(CADENCES)}.")


def _validate_dates(effective_from, effective_to=None):
    if not isinstance(effective_from, date):
        raise AssignmentError("effective_from must be a date.")
    if effective_to is not None:
        if not isinstance(effective_to, date):
            raise AssignmentError("effective_to must be a date.")
        if effective_to < effective_from:
            raise AssignmentError("effective_to cannot precede effective_from.")


@transaction.atomic
def create_assignment(
    *, hbpr, albanian_tl, cadence, effective_from, assigned_by=None
) -> HbprAlbanianTlAssignment:
    """Create an assignment; rejects when the AL TL already has any range
    (open or historical) that the new one would overlap."""
    _validate_participants(hbpr, albanian_tl)
    _validate_cadence(cadence)
    _validate_dates(effective_from)

    rows = list(
        HbprAlbanianTlAssignment.objects.select_for_update().filter(
            albanian_tl=albanian_tl
        )
    )
    for row in rows:
        row_end = row.effective_to
        if row_end is None or row_end >= effective_from:
            if row_end is None:
                raise AssignmentError(
                    "An open assignment already exists for this Albanian "
                    "TL. End or reassign it first."
                )
            raise AssignmentError(
                "The new assignment overlaps an existing historical range."
            )

    assignment = HbprAlbanianTlAssignment.objects.create(
        hbpr=hbpr,
        albanian_tl=albanian_tl,
        cadence=cadence,
        effective_from=effective_from,
        assigned_by=assigned_by,
    )
    assignment.full_clean()
    return assignment


@transaction.atomic
def reassign_assignment(
    *, albanian_tl, new_hbpr, cadence, effective_from, actor=None
) -> HbprAlbanianTlAssignment:
    """Close the open assignment and create a replacement in one transaction."""
    _validate_participants(new_hbpr, albanian_tl)
    _validate_cadence(cadence)
    _validate_dates(effective_from)

    open_row = (
        HbprAlbanianTlAssignment.objects.select_for_update()
        .filter(albanian_tl=albanian_tl, effective_to__isnull=True)
        .first()
    )
    if open_row is None:
        raise AssignmentError("No open assignment to reassign.")
    if open_row.effective_from >= effective_from:
        raise AssignmentError(
            "The replacement must start after the current assignment."
        )

    open_row.effective_to = effective_from - timedelta(days=1)
    open_row.ended_by = actor
    open_row.save(update_fields=["effective_to", "ended_by", "updated_at"])

    replacement = HbprAlbanianTlAssignment.objects.create(
        hbpr=new_hbpr,
        albanian_tl=albanian_tl,
        cadence=cadence,
        effective_from=effective_from,
        assigned_by=actor,
    )
    replacement.full_clean()
    return replacement


@transaction.atomic
def end_assignment(
    *, assignment: HbprAlbanianTlAssignment, effective_to: date, actor=None
) -> HbprAlbanianTlAssignment:
    """Close an assignment on a date, retaining the row as history."""
    _validate_dates(assignment.effective_from, effective_to)
    assignment = HbprAlbanianTlAssignment.objects.select_for_update().get(
        pk=assignment.pk
    )
    if assignment.effective_to is not None:
        raise AssignmentError("Assignment is already ended.")
    assignment.effective_to = effective_to
    assignment.ended_by = actor
    assignment.save(update_fields=["effective_to", "ended_by", "updated_at"])
    return assignment


def purge_ended_assignments(*, on_date: date | None = None) -> int:
    """Delete ended assignments whose last day in effect is older than the
    retention window, returning the deleted count.

    Only evidence-free rows are eligible: ``HbprGovernanceEvidence`` holds a
    PROTECT FK to the assignment, so evidence-bearing history must survive.
    There is no scheduler in this deployment — callers are the staff-only
    admin list (lazy sweep on read) and the ``purge_hbpr_archive`` command
    wired into ``docker/entrypoint.sh``.
    """
    cutoff = (on_date or today()) - relativedelta(months=ARCHIVE_RETENTION_MONTHS)
    qs = HbprAlbanianTlAssignment.objects.filter(
        effective_to__isnull=False, effective_to__lt=cutoff
    )
    if apps.is_installed("plugins.tl_scorecard"):
        qs = qs.filter(governance_evidence__isnull=True)
    deleted, _ = qs.delete()
    return deleted


def unfinished_q(on_date: date | None = None) -> Q:
    """Assignments not yet over on ``on_date``: no end date, or an end date that
    has not passed. ``effective_to`` is the LAST day in effect, so an assignment
    ending in the future still counts (it may not have started yet)."""
    return Q(effective_to__isnull=True) | Q(effective_to__gte=on_date or today())


def in_effect_q(on_date: date | None = None) -> Q:
    """Assignments covering ``on_date``: started on or before it and not over."""
    on_date = on_date or today()
    return Q(effective_from__lte=on_date) & unfinished_q(on_date)


def active_assignment_for_tl(albanian_tl_id, *, on_date: date | None = None):
    """The assignment in effect for one AL TL on ``on_date`` (default today), or None."""
    return (
        HbprAlbanianTlAssignment.objects.filter(
            in_effect_q(on_date), albanian_tl_id=albanian_tl_id
        )
        .select_related("hbpr", "albanian_tl")
        .order_by("-effective_from", "-id")
        .first()
    )


def active_assignments_for_hbpr(hbpr, *, on_date: date | None = None):
    """Assignments in effect for one HBPR on ``on_date`` (default today), newest first."""
    return (
        HbprAlbanianTlAssignment.objects.filter(in_effect_q(on_date), hbpr=hbpr)
        .select_related("hbpr", "albanian_tl")
        .order_by("-effective_from", "-id")
    )


def cadence_status(assignment, *, last_meeting_on, on_date=None) -> str:
    """Cadence state for one assignment against its latest cadence meeting.

    One definition shared by the admin serializer and the HBPR workspace
    overview so the two can never disagree about "overdue".
    """
    if not assignment.is_current:
        return "ended"
    if last_meeting_on is None:
        return "not_started"
    on_date = on_date or today()
    next_due = assignment.next_due_on(last_meeting_on=last_meeting_on)
    if on_date > next_due:
        return "overdue"
    if on_date >= next_due:
        return "due"
    return "on_track"


def today() -> date:
    return timezone.now().date()


def hbpr_revocation_refusal(user, data) -> dict | None:
    """Error payload when an update would revoke ``hbpr``/``albanian_tl`` while an
    open assignment depends on it, else ``None``.

    ``data`` is the admin update payload: a ``roles`` array wins over the legacy
    ``is_albanian_tl_role`` flag, exactly as ``update_user`` applies them. A role
    absent from the request is "not touched" and never checked.
    """
    from apps.permissions.services.role_service import find_blocked_hbpr_revocations

    if getattr(user, 'profile', None) is None:
        return None
    if 'roles' in data:
        requested = set(data['roles'] or [])
        new_state = {'hbpr': 'hbpr' in requested, 'albanian_tl': 'albanian_tl' in requested}
    elif 'is_albanian_tl_role' in data:
        new_state = {'albanian_tl': bool(data['is_albanian_tl_role'])}
    else:
        return None
    blocked = find_blocked_hbpr_revocations(user, new_state)
    if not blocked:
        return None
    summary = '; '.join(
        f"{b['role']}: {b['assignment_count']} open HBPR↔Albanian TL assignment(s) depend on this role"
        for b in blocked
    )
    return {
        'error': (
            'Cannot revoke role while an open HBPR↔Albanian TL assignment depends on it: '
            + summary
        ),
        # Canonical key: getBlockedRevocations reads `blocked_revocations`, so
        # the edit form opens the same dialog the bulk path does.
        'blocked_revocations': blocked,
    }
