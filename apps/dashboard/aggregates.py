"""Cross-endpoint dashboard aggregates — one implementation, several widgets.

``status_counts`` is the single place that decides what "pending", "approved"
and "rejected" mean for overtime/standby/leave. ``global_stats``,
``admin_overview.pending_backlog`` and ``hr_overview`` all read it, so the KPI
strip, the approval-queue status tab, the aging chips and the HR pipeline can
never disagree about the same number (they did before: each endpoint ran its
own count aggregate).

One aggregate per model computes every count and hour figure at once; leave
has no hours field, so it only gets counts.
"""

from django.contrib.auth import get_user_model
from django.db import models
from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce

from apps.leave_management.models import LeaveRequest
from apps.overtime.models import OvertimeLog
from apps.standby.models import StandbyLog
from apps.users.models import Team

User = get_user_model()

STATUS_KEYS = ("pending", "approved", "rejected")
_HOUR_TYPES = (("overtime", OvertimeLog), ("standby", StandbyLog))
_TYPES = (*_HOUR_TYPES, ("leave", LeaveRequest))


def _f(value) -> float:
    return float(value or 0)


def status_counts() -> dict:
    """Per-type and total request counts (plus approved/pending hours).

    ``{"overtime": {...}, "standby": {...}, "leave": {...}, "total": {...}}``
    with ``pending``/``approved``/``rejected`` on every block and
    ``approved_hours``/``pending_hours`` on the hour-bearing types.
    """
    out: dict = {}
    for key, model in _TYPES:
        aggregates = {
            status: Count("id", filter=Q(status=status)) for status in STATUS_KEYS
        }
        if model is not LeaveRequest:
            for status in ("approved", "pending"):
                aggregates[f"{status}_hours"] = Coalesce(
                    Sum("hours", filter=Q(status=status)),
                    0.0,
                    output_field=models.FloatField(),
                )
        row = model.objects.filter(is_deleted=False).aggregate(**aggregates)
        out[key] = {
            **{status: row[status] for status in STATUS_KEYS},
            **{k: _f(v) for k, v in row.items() if k.endswith("_hours")},
        }
    out["total"] = {
        status: sum(out[key][status] for key, _ in _TYPES) for status in STATUS_KEYS
    }
    return out


def global_stats_dict(counts: dict | None = None) -> dict:
    """The ``global_stats`` payload — shared by that endpoint and ``hr_overview``.

    Soft-deleted rows are excluded from every aggregate; ``total_users`` keeps
    counting all accounts, with ``active_users`` alongside. The overtime
    average divides by active users, matching every other headcount figure on
    the dashboards. Pass ``counts`` when the caller already computed
    ``status_counts()`` to avoid re-running the aggregates.
    """
    counts = counts or status_counts()
    total_users = User.objects.count()
    active_users = User.objects.filter(is_active=True).count()
    total_overtime = counts["overtime"]["approved_hours"]

    return {
        "total_users": total_users,
        "active_users": active_users,
        "total_overtime_hours": total_overtime,
        "total_standby_hours": counts["standby"]["approved_hours"],
        "pending_overtime": counts["overtime"]["pending"],
        "approved_overtime": counts["overtime"]["approved"],
        "rejected_overtime": counts["overtime"]["rejected"],
        "pending_standby": counts["standby"]["pending"],
        "approved_standby": counts["standby"]["approved"],
        "rejected_standby": counts["standby"]["rejected"],
        "pending_leaves": counts["leave"]["pending"],
        "approved_leaves": counts["leave"]["approved"],
        "rejected_leaves": counts["leave"]["rejected"],
        "avg_overtime_hours": total_overtime / active_users if active_users else 0.0,
        "active_teams_count": Team.objects.active().count(),
    }
