"""Org-wide aggregates for the HR dashboard widgets.

Same pattern as ``admin_overview``: plain aggregates over live data, Decimals
converted to floats at this boundary, every queryset excludes soft-deleted
rows. Gated by ``IsHR`` at the viewset — pure-HR viewers get the same org data
as staff, which the personal OT/SB endpoints can never serve them
(``HrOnlyBlockedMixin`` + ``PersonalOnlyFilterMixin`` scope those to the
viewer's own current-month rows).
"""

from django.db.models.functions import Coalesce

from apps.leave_management.models import LeaveRequest
from apps.leave_management.models.core import count_request_days, global_holiday_dates
from apps.overtime.models import OvertimeLog
from apps.standby.models import StandbyLog
from core.utils.timezone_local import business_today

from .admin_trends import _monthly_hours, _window
from .aggregates import global_stats_dict, status_counts

MONTHS = 6
RECENT_LIMIT = 5
PENDING_LEAVE_LIMIT = 50


def _f(value) -> float:
    return float(value or 0)


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
    counts = status_counts()
    pending_leave, pending_leave_total = _pending_leave()
    stats = global_stats_dict(counts)
    monthly = _monthly_series(today)
    # `stats.avg_overtime_hours` is lifetime; the HR tile is a monthly figure (current month last).
    active = stats["active_users"]
    return {
        "stats": stats,
        "month_avg_overtime_hours": monthly[-1]["overtime"] / active if active else 0.0,
        "status_counts": counts["total"],
        "monthly_hours": monthly,
        "recent_overtime": _recent_hours(OvertimeLog),
        "recent_standby": _recent_hours(StandbyLog),
        "pending_leave": pending_leave,
        "pending_leave_total": pending_leave_total,
    }
