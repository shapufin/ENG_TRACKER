"""Explicit HBPR ↔ Line Manager assignment model.

The assignment is the single source of truth for HBPR scope: an HBPR sees
exactly the Line Managers they are assigned to, never a global role population.
One open assignment per Line Manager is enforced by a partial unique constraint and
the write service; history is retained via effective dates.
"""

from __future__ import annotations

from datetime import date, timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from core.models.abstract import BaseModel, TrackedFieldsMixin
from core.utils.cadence import (  # noqa: F401  (re-exported: other modules import it from here)
    MAX_PUSHES,
    get_nth_weekday_of_month,
    next_due_slot as _shared_next_due_slot,
    raw_next_due as _shared_raw_next_due,
)
from core.utils.timezone_local import business_today

CADENCE_CHOICES = [
    ("weekly", "Weekly"),
    ("biweekly", "Biweekly"),
    ("monthly", "Monthly"),
]

# The monthly "nth weekday" options, in display order. One source: the model's
# ``clean()`` and every serializer that accepts a schedule read this tuple.
NTH_WEEK_CHOICES = (1, 2, 3, 4, -1)

_CADENCE_STEP_DAYS = {"weekly": 7, "biweekly": 14}

WEEKDAY_NAMES = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
]
NTH_WEEK_NAMES = {1: "1st", 2: "2nd", 3: "3rd", 4: "4th", -1: "Last"}


class HbprAlbanianTlAssignment(TrackedFieldsMixin, BaseModel):
    """A dated, admin-managed pairing of one HBPR with one Line Manager."""

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
    cadence = models.CharField(
        max_length=20, choices=CADENCE_CHOICES, null=True, blank=True
    )
    cadence_day_of_week = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text="0=Monday, 1=Tuesday, ..., 6=Sunday",
    )
    cadence_nth_week = models.SmallIntegerField(
        null=True,
        blank=True,
        help_text="1=1st, 2=2nd, 3=3rd, 4=4th, -1=Last (for monthly)",
    )
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
        return f"{self.hbpr} ↔ {self.albanian_tl} ({self.cadence or 'no cadence'})"

    def clean(self):
        from apps.permissions.services.role_service import has_role

        if self.hbpr_id and not has_role(self.hbpr, "hbpr"):
            raise ValidationError({"hbpr": "User must hold the hbpr role."})
        if self.albanian_tl_id and not has_role(self.albanian_tl, "albanian_tl"):
            raise ValidationError(
                {"albanian_tl": "User must hold the albanian_tl role."}
            )
        if self.cadence is None:
            if self.cadence_day_of_week is not None or self.cadence_nth_week is not None:
                raise ValidationError(
                    {"cadence": "Set a cadence before choosing a weekday or week."}
                )
        elif self.cadence not in dict(CADENCE_CHOICES):
            raise ValidationError(
                {"cadence": f"cadence must be one of {sorted(dict(CADENCE_CHOICES))}."}
            )
        if self.cadence_day_of_week is not None and self.cadence_day_of_week not in range(7):
            raise ValidationError({"cadence_day_of_week": "Must be between 0 (Monday) and 6 (Sunday)."})
        if self.cadence_nth_week is not None:
            if self.cadence != "monthly":
                raise ValidationError({"cadence_nth_week": "Only valid for monthly cadence."})
            if self.cadence_nth_week not in NTH_WEEK_CHOICES:
                raise ValidationError({"cadence_nth_week": "Must be 1, 2, 3, 4, or -1 (Last)."})
            if self.cadence_day_of_week is None:
                raise ValidationError({"cadence_day_of_week": "Required when specifying week of month."})
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
        return self.effective_to is None or self.effective_to >= business_today()

    @property
    def cadence_display(self) -> str:
        """Human-readable description of cadence frequency and schedule."""
        if not self.cadence:
            return "Not set"
        weekday_name = (
            WEEKDAY_NAMES[self.cadence_day_of_week]
            if self.cadence_day_of_week is not None and 0 <= self.cadence_day_of_week <= 6
            else None
        )
        if self.cadence == "monthly":
            if self.cadence_nth_week in NTH_WEEK_NAMES and weekday_name:
                return f"Monthly ({NTH_WEEK_NAMES[self.cadence_nth_week]} {weekday_name})"
            return "Monthly"
        if self.cadence in ("weekly", "biweekly") and weekday_name:
            prefix = "Weekly" if self.cadence == "weekly" else "Biweekly"
            return f"{prefix} ({weekday_name})"
        return dict(CADENCE_CHOICES).get(self.cadence, self.cadence)

    _MAX_HOLIDAY_PUSHES = MAX_PUSHES

    def next_due_on(self, *, last_meeting_on: date | None) -> date | None:
        """Next cadence date after the last slot, moved past public holidays."""
        return self.next_due_slot(last_meeting_on=last_meeting_on)[0]

    def next_due_slot(
        self, *, last_meeting_on: date | None
    ) -> tuple[date, date | None] | tuple[None, None]:
        """``(due, moved_from)``: the next slot, and the holiday date it replaced.

        A due date that is a global public holiday moves to the following slot of
        the same cadence, and repeats while that one is a holiday too. The maths is
        shared with the 1-on-1 plans (``core.utils.cadence``).
        """
        from apps.leave_management.models.core import global_holiday_dates

        if not self.cadence:
            return None, None
        due = self._raw_next_due(last_meeting_on=last_meeting_on)
        holidays = global_holiday_dates(due, due + timedelta(days=366))
        return _shared_next_due_slot(
            self.cadence, self.cadence_day_of_week, self.cadence_nth_week,
            self.effective_from, last_meeting_on, blocked=holidays,
        )

    def _raw_next_due(self, *, last_meeting_on: date | None) -> date:
        """Next cadence date after the last meeting (or the start date)."""
        return _shared_raw_next_due(
            self.cadence, self.cadence_day_of_week, self.cadence_nth_week,
            self.effective_from, last_meeting_on,
        )
