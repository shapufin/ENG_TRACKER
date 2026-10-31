"""Org-wide aggregates for the HR dashboard widgets.

Same pattern as ``admin_overview``: plain aggregates over live data, Decimals
converted to floats at this boundary, every queryset excludes soft-deleted
rows. Gated by ``IsHR`` at the viewset — pure-HR viewers get the same org data
as staff, which the personal OT/SB endpoints can never serve them
(``HrOnlyBlockedMixin`` + ``PersonalOnlyFilterMixin`` scope those to the
viewer's own current-month rows).
"""

from django.contrib.auth import get_user_model
from django.db import models
from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce

from apps.leave_management.models import LeaveRequest
from apps.leave_management.models.core import count_request_days, global_holiday_dates
from apps.overtime.models import OvertimeLog
from apps.standby.models import StandbyLog
from apps.users.models import Team
from core.utils.timezone_local import business_today

from .admin_trends import _monthly_hours, _window

User = get_user_model()

MONTHS = 6
RECENT_LIMIT = 5
PENDING_LEAVE_LIMIT = 50


def _f(value) -> float:
    return float(value or 0)


def global_stats_dict() -> dict:
    """The ``global_stats`` payload — shared so the two widgets cannot drift.

    Soft-deleted rows are excluded from every aggregate; ``total_users`` keeps
    counting all accounts (headcount KPI), with ``active_users`` alongside.
    """
    total_users = User.objects.count()
    active_users = User.objects.filter(is_active=True).count()

    overtime_stats = OvertimeLog.objects.filter(is_deleted=False).aggregate(
        total_hours=Coalesce(Sum("hours", filter=Q(status="approved")), 0.0,
                             output_field=models.FloatField()),
        pending_count=Count("id", filter=Q(status="pending")),
        approved_count=Count("id", filter=Q(status="approved")),
        rejected_count=Count("id", filter=Q(status="rejected")),
    )
    standby_stats = StandbyLog.objects.filter(is_deleted=False).aggregate(
        total_hours=Coalesce(Sum("hours", filter=Q(status="approved")), 0.0,
                             output_field=models.FloatField()),
        pending_count=Count("id", filter=Q(status="pending")),
        approved_count=Count("id", filter=Q(status="approved")),
        rejected_count=Count("id", filter=Q(status="rejected")),
    )
    leave_stats = LeaveRequest.objects.filter(is_deleted=False).aggregate(
        pending_count=Count("id", filter=Q(status="pending")),
        approved_count=Count("id", filter=Q(status="approved")),
        rejected_count=Count("id", filter=Q(status="rejected")),
    )

    return {
        "total_users": total_users,
        "active_users": active_users,
        "total_overtime_hours": _f(overtime_stats["total_hours"]),
        "total_standby_hours": _f(standby_stats["total_hours"]),
        "pending_overtime": overtime_stats["pending_count"],
        "approved_overtime": overtime_stats["approved_count"],
        "rejected_overtime": overtime_stats["rejected_count"],
        "pending_standby": standby_stats["pending_count"],
        "approved_standby": standby_stats["approved_count"],
        "rejected_standby": standby_stats["rejected_count"],
        "pending_leaves": leave_stats["pending_count"],
        "approved_leaves": leave_stats["approved_count"],
        "rejected_leaves": leave_stats["rejected_count"],
        "avg_overtime_hours": (
            _f(overtime_stats["total_hours"]) / active_users if active_users else 0.0
        ),
        "active_teams_count": Team.objects.active().count(),
    }


def _status_counts() -> dict:
    """Org-wide request pipeline: pending/approved/rejected across all three types."""
    def counts(model):
        return model.objects.filter(is_deleted=False).aggregate(
            pending=Count("id", filter=Q(status="pending")),
            approved=Count("id", filter=Q(status="approved")),
            rejected=Count("id", filter=Q(status="rejected")),
        )

    totals = {"pending": 0, "approved": 0, "rejected": 0}
    for model in (OvertimeLog, StandbyLog, LeaveRequest):
        for key, n in counts(model).items():
            totals[key] += n
    return totals


def _monthly_series(today) -> list:
    starts = _window(today, MONTHS)
    ot = _monthly_hours(OvertimeLog, starts, status="approved")
    sb = _monthly_hours(StandbyLog, starts, status="approved")
    return [
        {
            "month": s.strftime("%Y-%m"),
            "label": s.strftime("%b"),
            "overtime": ot[i],
            "standby": sb[i],
        }
        for i, s in enumerate(starts)
    ]


def _name(user) -> str:
    return user.get_full_name() or user.username


def _recent_hours(model) -> list:
    rows = (
        model.objects.filter(is_deleted=False)
        .select_related("user")
        .order_by("-date", "-id")[:RECENT_LIMIT]
    )
    return [
        {
            "id": r.id,
            "user_name": _name(r.user),
            "hours": _f(r.hours),
            "date": r.date.isoformat(),
            "status": r.status,
        }
        for r in rows
    ]


def _pending_leave() -> tuple[list, int]:
    qs = (
        LeaveRequest.objects.filter(is_deleted=False, status="pending")
        .select_related("user")
        .order_by(Coalesce("submitted_at", "created_at"), "id")
    )
    total = qs.count()
    rows = list(qs[:PENDING_LEAVE_LIMIT])
    # One holiday fetch for the whole page of day computations.
    if rows:
        holidays = global_holiday_dates(
            min(r.start_date for r in rows), max(r.end_date for r in rows)
        )
    else:
        holidays = set()
    items = [
        {
            "id": r.id,
            "user_name": _name(r.user),
            "days_requested": count_request_days(r.request_type, r.start_date, r.end_date, holidays),
            "status": r.status,
            "start_date": r.start_date.isoformat(),
            "end_date": r.end_date.isoformat(),
        }
        for r in rows
    ]
    return items, total


def build_hr_overview() -> dict:
    today = business_today()
    pending_leave, pending_leave_total = _pending_leave()
    return {
        "stats": global_stats_dict(),
        "status_counts": _status_counts(),
        "monthly_hours": _monthly_series(today),
        "recent_overtime": _recent_hours(OvertimeLog),
        "recent_standby": _recent_hours(StandbyLog),
        "pending_leave": pending_leave,
        "pending_leave_total": pending_leave_total,
    }
