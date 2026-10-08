"""Org-wide time series and "who is out" aggregates for the admin dashboard.

Plain aggregates over live data (no snapshots), approved rows only except the
explicit pending-overtime overlay. Decimals become floats at this boundary.
Callers must already have verified the viewer is staff/superuser.
"""

from collections import defaultdict
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone

from apps.leave_management.models import LeaveRequest
from apps.leave_management.models.core import count_business_days
from apps.overtime.models import OvertimeLog
from apps.standby.models import StandbyLog
from apps.users.models import Team
from apps.users.models.core import TeamMembership

User = get_user_model()

MONTHS = 12  # default window
MIN_MONTHS = 3
MAX_MONTHS = 24
CLIENT_LIMIT = 6
WHO_IS_OUT_LIMIT = 20
UPCOMING_LEAVE_DAYS = 14


def _f(value) -> float:
    return float(value or 0)


def _month_start(d: date) -> date:
    return d.replace(day=1)


def _add_months(d: date, n: int) -> date:
    idx = d.year * 12 + (d.month - 1) + n
    return date(idx // 12, idx % 12 + 1, 1)


def _window(today: date, months: int = MONTHS):
    """``months`` month-start dates, oldest first, current month last."""
    current = _month_start(today)
    return [_add_months(current, -(months - 1) + i) for i in range(months)]


def _monthly_hours(model, starts, **filters):
    rows = (
        model.objects.filter(date__gte=starts[0], **filters)
        .annotate(m=TruncMonth("date"))
        .values("m")
        .annotate(h=Sum("hours"))
    )
    by_month = {r["m"]: _f(r["h"]) for r in rows}
    return [by_month.get(s, 0.0) for s in starts]


def _leave_days(starts):
    """Business days per month by type; a request is clipped to each month it overlaps."""
    series = {"vacation": [0.0] * len(starts), "sick": [0.0] * len(starts)}
    end_of_window = _add_months(starts[-1], 1) - timedelta(days=1)
    rows = LeaveRequest.objects.filter(
        status="approved", end_date__gte=starts[0], start_date__lte=end_of_window
    ).values_list("request_type", "start_date", "end_date")
    for kind, start, end in rows:
        if kind not in series:
            continue
        for i, m_start in enumerate(starts):
            m_end = _add_months(m_start, 1) - timedelta(days=1)
            lo, hi = max(start, m_start), min(end, m_end)
            if lo <= hi:
                series[kind][i] += count_business_days(lo, hi)
    return series


def _overtime_by_client(month_start):
    rows = list(
        OvertimeLog.objects.filter(status="approved", date__gte=month_start)
        .values("client_id", "client__name")
        .annotate(h=Sum("hours"))
        .order_by("-h")
    )
    total = sum(_f(r["h"]) for r in rows)
    if not total:
        return []
    named = [
        {"client_id": r["client_id"], "name": r["client__name"], "hours": _f(r["h"])}
        for r in rows[:CLIENT_LIMIT]
    ]
    rest = sum(_f(r["h"]) for r in rows[CLIENT_LIMIT:])
    if rest:
        named.append({"client_id": None, "name": "Other", "hours": rest})
    for r in named:
        r["share_pct"] = round(r["hours"] / total * 100, 1)
    return named


def _team_comparison(month_start):
    teams = list(
        Team.objects.annotate(size=Count("members", filter=Q(members__user__is_active=True), distinct=True))
        .order_by("name")
        .values("id", "name", "size")
    )
    hours = {}
    for key, model in (("ot", OvertimeLog), ("sb", StandbyLog)):
        hours[key] = {
            r["user__profile__teams"]: _f(r["h"])
            for r in model.objects.filter(status="approved", date__gte=month_start)
            .values("user__profile__teams")
            .annotate(h=Sum("hours"))
        }
    leave_rows = list(
        LeaveRequest.objects.filter(status="approved", end_date__gte=month_start).values_list(
            "user_id", "start_date", "end_date"
        )
    )
    members = defaultdict(list)
    if leave_rows:
        for uid, tid in TeamMembership.objects.filter(
            user_profile__user_id__in={u for u, _, _ in leave_rows}
        ).values_list("user_profile__user_id", "team_id"):
            members[uid].append(tid)
    month_end = _add_months(month_start, 1) - timedelta(days=1)
    leave = defaultdict(float)
    for uid, start, end in leave_rows:
        lo, hi = max(start, month_start), min(end, month_end)
        if lo <= hi:
            days = count_business_days(lo, hi)
            for tid in members.get(uid, ()):
                leave[tid] += days
    out = []
    for t in teams:
        ot = hours["ot"].get(t["id"], 0.0)
        out.append(
            {
                "team_id": t["id"],
                "name": t["name"],
                "team_size": t["size"],
                "overtime_hours": ot,
                "standby_hours": hours["sb"].get(t["id"], 0.0),
                "leave_days": leave.get(t["id"], 0.0),
                "overtime_per_capita": round(ot / t["size"], 1) if t["size"] else None,
            }
        )
    return out


def _display(u) -> str:
    return u.get_full_name() or u.username


def _team_names(user_ids):
    names = {}
    for uid, name in (
        TeamMembership.objects.filter(user_profile__user_id__in=user_ids)
        .order_by("-team__name")
        .values_list("user_profile__user_id", "team__name")
    ):
        names[uid] = name  # ordered desc so the alphabetically first name wins last
    return names


def _who_is_out(today):
    leave = list(
        LeaveRequest.objects.filter(status="approved", start_date__lte=today, end_date__gte=today)
        .select_related("user")
        .order_by("end_date", "user__first_name", "user__username")[:WHO_IS_OUT_LIMIT]
    )
    standby = list(
        StandbyLog.objects.filter(status="approved", date=today)
        .select_related("user")
        .order_by("user__first_name", "user__username")[:WHO_IS_OUT_LIMIT]
    )
    teams = _team_names({r.user_id for r in leave} | {r.user_id for r in standby})
    upcoming = LeaveRequest.objects.filter(
        status="approved",
        start_date__gt=today,
        start_date__lte=today + timedelta(days=UPCOMING_LEAVE_DAYS),
    ).count()
    return {
        "date": today.isoformat(),
        "on_leave": [
            {
                "user_id": r.user_id,
                "name": _display(r.user),
                "team": teams.get(r.user_id),
                "request_type": r.request_type,
                "until": r.end_date.isoformat(),
            }
            for r in leave
        ],
        "on_standby": [
            {"user_id": r.user_id, "name": _display(r.user), "team": teams.get(r.user_id)} for r in standby
        ],
        "upcoming_leave_14d": upcoming,
    }


def build_admin_trends(user, today: date | None = None, months: int = MONTHS) -> dict:
    """``months`` (3-24) sets the series window; the client/team/who-is-out blocks stay current-month."""
    today = today or timezone.localdate()
    starts = _window(today, months)
    leave = _leave_days(starts)
    return {
        "months": [s.strftime("%Y-%m") for s in starts],
        "hours": {
            "overtime": _monthly_hours(OvertimeLog, starts, status="approved"),
            "standby": _monthly_hours(StandbyLog, starts, status="approved"),
            "pending_overtime": _monthly_hours(OvertimeLog, starts, status="pending"),
        },
        "leave_days": leave,
        "overtime_by_client": _overtime_by_client(starts[-1]),
        "team_comparison": _team_comparison(starts[-1]),
        "who_is_out": _who_is_out(today),
    }
