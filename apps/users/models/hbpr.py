"""Explicit HBPR ↔ Albanian TL assignment model.

The assignment is the single source of truth for HBPR scope: an HBPR sees
exactly the Albanian TLs they are assigned to, never a global role population.
One open assignment per AL TL is enforced by a partial unique constraint and
the write service; history is retained via effective dates.
"""

from __future__ import annotations

import calendar
from datetime import date, timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from core.models.abstract import BaseModel, TrackedFieldsMixin

CADENCE_CHOICES = [
    ("weekly", "Weekly"),
    ("biweekly", "Biweekly"),
    ("monthly", "Monthly"),
]

_CADENCE_STEP_DAYS = {"weekly": 7, "biweekly": 14}


class HbprAlbanianTlAssignment(TrackedFieldsMixin, BaseModel):
    """A dated, admin-managed pairing of one HBPR with one Albanian TL."""

    tracked_fields = ("effective_to",)

    hbpr = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="hbpr_albanian_tl_assignments",
    )
    albanian_tl = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="hbpr_assignments",
    )
    cadence = models.CharField(max_length=20, choices=CADENCE_CHOICES)
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="hbpr_assignments_granted",
    )
    ended_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="hbpr_assignments_ended",
    )

    class Meta:
        db_table = "hbpr_albanian_tl_assignments"
        ordering = ["-effective_from", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(effective_to__isnull=True)
                    | models.Q(effective_to__gte=models.F("effective_from"))
                ),
                name="hbpr_assignment_end_not_before_start",
            ),
            models.UniqueConstraint(
                fields=["albanian_tl"],
                condition=models.Q(effective_to__isnull=True),
                name="unique_open_hbpr_assignment_per_al_tl",
            ),
        ]
        indexes = [
            models.Index(
                fields=["hbpr", "effective_from", "effective_to"],
                name="hbpr_assign_hbpr_range_idx",
            ),
            models.Index(
                fields=["albanian_tl", "effective_to"],
                name="hbpr_assign_tl_end_idx",
            ),
        ]

    def __str__(self):
        return f"{self.hbpr} ↔ {self.albanian_tl} ({self.cadence})"

    def clean(self):
        from apps.permissions.services.role_service import has_role

        if self.hbpr_id and not has_role(self.hbpr, "hbpr"):
            raise ValidationError({"hbpr": "User must hold the hbpr role."})
        if self.albanian_tl_id and not has_role(self.albanian_tl, "albanian_tl"):
            raise ValidationError(
                {"albanian_tl": "User must hold the albanian_tl role."}
            )
        if self.cadence not in dict(CADENCE_CHOICES):
            raise ValidationError(
                {"cadence": f"cadence must be one of {sorted(dict(CADENCE_CHOICES))}."}
            )
        if (
            self.effective_to is not None
            and self.effective_from is not None
            and self.effective_to < self.effective_from
        ):
            raise ValidationError(
                {"effective_to": "Cannot end before the assignment starts."}
            )

    @property
    def is_current(self) -> bool:
        """Not over yet: ``effective_to`` is the last day in effect, not a switch."""
        return self.effective_to is None or self.effective_to >= timezone.now().date()

    def next_due_on(self, *, last_meeting_on: date | None) -> date:
        """Next cadence date after the last meeting (or the start date)."""
        anchor = last_meeting_on or self.effective_from
        if self.cadence in _CADENCE_STEP_DAYS:
            return anchor + timedelta(days=_CADENCE_STEP_DAYS[self.cadence])
        # Monthly: same calendar day in the next month, clamped to month end.
        year, month = anchor.year, anchor.month
        if month == 12:
            year, month = year + 1, 1
        else:
            month += 1
        day = min(anchor.day, calendar.monthrange(year, month)[1])
        return date(year, month, day)
