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

from core.models.abstract import BaseModel, TrackedFieldsMixin
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


def get_nth_weekday_of_month(year: int, month: int, nth: int, weekday: int) -> date:
    """Compute the calendar date for the Nth weekday of a given year and month.

    nth: 1 (1st), 2 (2nd), 3 (3rd), 4 (4th), or -1 (Last)
    weekday: 0=Monday ... 6=Sunday
    """
    if nth == -1:
        last_day = calendar.monthrange(year, month)[1]
        cur = date(year, month, last_day)
        offset = (cur.weekday() - weekday) % 7
        return cur - timedelta(days=offset)

    first_day = date(year, month, 1)
    offset = (weekday - first_day.weekday()) % 7
    first_occurrence = first_day + timedelta(days=offset)
    target = first_occurrence + timedelta(weeks=nth - 1)
    if target.month != month:
        # Fallback to last occurrence if month doesn't have 5
        return target - timedelta(weeks=1)
    return target


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

    def next_due_on(self, *, last_meeting_on: date | None) -> date:
        """Next cadence date after the last meeting (or the start date)."""
        anchor = last_meeting_on or self.effective_from

        if self.cadence == "weekly":
            if self.cadence_day_of_week is not None:
                if last_meeting_on is None:
                    offset = (self.cadence_day_of_week - self.effective_from.weekday()) % 7
                    return self.effective_from + timedelta(days=offset)
                next_due = last_meeting_on + timedelta(days=7)
                offset = (self.cadence_day_of_week - next_due.weekday()) % 7
                return next_due + timedelta(days=offset)
            return anchor + timedelta(days=7)

        if self.cadence == "biweekly":
            if self.cadence_day_of_week is not None:
                if last_meeting_on is None:
                    offset = (self.cadence_day_of_week - self.effective_from.weekday()) % 7
                    return self.effective_from + timedelta(days=offset)
                next_due = last_meeting_on + timedelta(days=14)
                offset = (self.cadence_day_of_week - next_due.weekday()) % 7
                return next_due + timedelta(days=offset)
            return anchor + timedelta(days=14)

        # Monthly
        if self.cadence_nth_week is not None and self.cadence_day_of_week is not None:
            if last_meeting_on is None:
                candidate = get_nth_weekday_of_month(
                    self.effective_from.year,
                    self.effective_from.month,
                    self.cadence_nth_week,
                    self.cadence_day_of_week,
                )
                if candidate >= self.effective_from:
                    return candidate
                # Candidate has passed relative to effective_from; advance to next month
                next_year = self.effective_from.year + (1 if self.effective_from.month == 12 else 0)
                next_month = 1 if self.effective_from.month == 12 else self.effective_from.month + 1
                return get_nth_weekday_of_month(
                    next_year, next_month, self.cadence_nth_week, self.cadence_day_of_week
                )
            # Advance to the month following last_meeting_on
            next_year = last_meeting_on.year + (1 if last_meeting_on.month == 12 else 0)
            next_month = 1 if last_meeting_on.month == 12 else last_meeting_on.month + 1
            return get_nth_weekday_of_month(
                next_year, next_month, self.cadence_nth_week, self.cadence_day_of_week
            )

        # Standard monthly (day of month, clamped to month end)
        year, month = anchor.year, anchor.month
        if month == 12:
            year, month = year + 1, 1
        else:
            month += 1
        day = min(anchor.day, calendar.monthrange(year, month)[1])
        return date(year, month, day)
