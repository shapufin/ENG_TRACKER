"""Transactional lifecycle for HBPR ↔ Albanian TL assignments.

All writes funnel through this service so the one-open-assignment rule and
overlap rejection are enforced with row locks, not serializer-only checks.
"""

from __future__ import annotations

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from apps.permissions.services.role_service import has_role
from apps.users.models.hbpr import HbprAlbanianTlAssignment

User = get_user_model()

CADENCES = {"weekly", "biweekly", "monthly"}


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


def active_assignment_for_tl(albanian_tl_id, *, on_date: date | None = None):
    """The current open assignment for one AL TL, or None."""
    qs = HbprAlbanianTlAssignment.objects.filter(
        albanian_tl_id=albanian_tl_id, effective_to__isnull=True
    )
    if on_date is not None:
        qs = qs.filter(effective_from__lte=on_date)
    return qs.select_related("hbpr", "albanian_tl").first()


def active_assignments_for_hbpr(hbpr, *, on_date: date | None = None):
    """Current open assignments for one HBPR, newest first."""
    qs = HbprAlbanianTlAssignment.objects.filter(
        hbpr=hbpr, effective_to__isnull=True
    )
    if on_date is not None:
        qs = qs.filter(effective_from__lte=on_date)
    return qs.select_related("hbpr", "albanian_tl").order_by(
        "-effective_from", "-id"
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
