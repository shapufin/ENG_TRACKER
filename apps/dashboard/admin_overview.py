"""Org-wide aggregates for the admin dashboard overview widgets.

Every section is a plain aggregate over live data (no snapshots). Decimals are
converted to floats at this boundary. Callers must already have verified the
viewer is staff/superuser; ``backup_status`` additionally needs a superuser.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.leave_management.models import LeaveBalance, LeaveRequest
from apps.leave_management.models.core import count_business_days
from apps.overtime.models import OvertimeLog
from apps.standby.models import StandbyLog
from apps.users.models import ApprovalPeriodClose, Team
from apps.users.models.hbpr import HbprAlbanianTlAssignment
from apps.users.services.hbpr_assignments import in_effect_q

User = get_user_model()

AGING_BUCKETS = ["0-3d", "4-7d", "8-14d", "15d+"]
_AGING_EDGES = (4, 8, 15)  # lower age (days) at which the next bucket starts
CARRYOVER_WARNING_DAYS = 60
BACKUP_STALE_DAYS = 7
OPEN_TLS_LIMIT = 10


def _f(value) -> float:
    return float(value or 0)


def headcount(now):
    users = User.objects.aggregate(
        total_users=Count("id"),
        active_users=Count("id", filter=Q(is_active=True)),
        inactive_users=Count("id", filter=Q(is_active=False)),
        new_hires_30d=Count("id", filter=Q(date_joined__gte=now - timedelta(days=30))),
        never_logged_in=Count("id", filter=Q(is_active=True, last_login__isnull=True)),
    )
    return users


def _plain_employees():
    """Active users that are expected to sit in a team with a TL (not admins)."""
    return User.objects.filter(is_active=True, is_staff=False, is_superuser=False)


def employees_without_tl():
    """Same definition as users/stats `no_tl_count`: not a TL and none assigned."""
    return (
        _plain_employees()
        .filter(
            profile__is_italian_tl_role=False,
            profile__is_albanian_tl_role=False,
            profile__italian_tl__isnull=True,
            profile__albanian_tl__isnull=True,
        )
        .exclude(profile__role_codes__icontains="italian_tl")
        .exclude(profile__role_codes__icontains="albanian_tl")
        .count()
    )


def coverage_gaps(today):
    employees = _plain_employees()
    al_tls = employees.filter(
        Q(profile__is_albanian_tl_role=True) | Q(profile__role_codes__icontains="albanian_tl")
    )
    covered = HbprAlbanianTlAssignment.objects.filter(in_effect_q(today)).values("albanian_tl_id")
    return {
        "teams_without_leader": Team.objects.filter(team_leader__isnull=True).count(),
        "users_without_team": employees.filter(profile__teams__isnull=True).count(),
        "users_without_tech": employees.filter(profile__techs__isnull=True).count(),
        "employees_without_tl": employees_without_tl(),
        "al_tls_without_hbpr_assignment": al_tls.exclude(pk__in=covered).distinct().count(),
    }


def pending_backlog():
    ot = OvertimeLog.objects.filter(status="pending").aggregate(count=Count("id"), hours=Sum("hours"))
    sb = StandbyLog.objects.filter(status="pending").aggregate(count=Count("id"), hours=Sum("hours"))
    leave = list(LeaveRequest.objects.filter(status="pending").values_list("start_date", "end_date"))
    return {
        "overtime": {"count": ot["count"], "hours": _f(ot["hours"])},
        "standby": {"count": sb["count"], "hours": _f(sb["hours"])},
        "leave": {
            "count": len(leave),
            # Business days, never (end - start).days
            "days": sum(count_business_days(s, e) for s, e in leave),
        },
    }


def _bucket_counts(qs, field, now):
    """Pending rows per age bucket; age is whole days since ``field``."""
    e1, e2, e3 = (now - timedelta(days=d) for d in _AGING_EDGES)
    row = qs.aggregate(
        b0=Count("id", filter=Q(**{f"{field}__gt": e1})),
        b1=Count("id", filter=Q(**{f"{field}__lte": e1, f"{field}__gt": e2})),
        b2=Count("id", filter=Q(**{f"{field}__lte": e2, f"{field}__gt": e3})),
        b3=Count("id", filter=Q(**{f"{field}__lte": e3})),
    )
    return [row["b0"], row["b1"], row["b2"], row["b3"]]


def approval_aging(now):
    leave = LeaveRequest.objects.filter(status="pending").annotate(
        submitted=Coalesce("submitted_at", "created_at")
    )
    return {
        "buckets": AGING_BUCKETS,
        "overtime": _bucket_counts(OvertimeLog.objects.filter(status="pending"), "submitted_at", now),
        "standby": _bucket_counts(StandbyLog.objects.filter(status="pending"), "submitted_at", now),
        "leave": _bucket_counts(leave, "submitted", now),
    }


def leave_utilization(year):
    t = LeaveBalance.objects.filter(year=year, leave_type="vacation").aggregate(
        total=Sum("total_days"), used=Sum("used_days"), pending=Sum("pending_days")
    )
    total, used, pending = _f(t["total"]), _f(t["used"]), _f(t["pending"])
    return {
        "year": year,
        "total_days": total,
        "used_days": used,
        "pending_days": pending,
        "available_days": total - used - pending,
        "utilization_pct": round(used / total * 100, 1) if total else None,
    }


def carryover_expiry(today):
    rows = LeaveBalance.objects.filter(
        is_carry_over=True,
        expires_at__gte=today,
        expires_at__lte=today + timedelta(days=CARRYOVER_WARNING_DAYS),
    )
    at_risk = {}
    for b in rows:
        left = _f(b.available_days)
        if left > 0:
            at_risk[b.user_id] = at_risk.get(b.user_id, 0.0) + left
    return {
        "window_days": CARRYOVER_WARNING_DAYS,
        "days_at_risk": sum(at_risk.values()),
        "users_affected": len(at_risk),
    }


def period_close(today):
    """TL close status for the previous calendar month (the one being settled)."""
    period = (today.replace(day=1) - timedelta(days=1)).replace(day=1)
    tls = list(
        User.objects.filter(is_active=True)
        .filter(
            Q(led_teams__isnull=False)
            | Q(italian_team_members__isnull=False)
            | Q(albanian_team_members__isnull=False)
        )
        .distinct()
        .order_by("first_name", "username")
    )
    closed_keys = set(
        ApprovalPeriodClose.objects.filter(boundary__period=period).values_list("scope_key", flat=True)
    )
    open_tls = [tl for tl in tls if f"managed-user:{tl.pk}" not in closed_keys]
    return {
        "period": period.strftime("%Y-%m"),
        "tls_total": len(tls),
        "tls_closed": len(tls) - len(open_tls),
        "tls_open": len(open_tls),
        "open_tls": [
            {"id": tl.pk, "name": tl.get_full_name() or tl.username} for tl in open_tls[:OPEN_TLS_LIMIT]
        ],
    }


def backup_status(now):
    """Latest site backup. Superuser-only data: callers must gate it."""
    from plugins.site_backup.models import BackupRecord

    latest = BackupRecord.objects.order_by("-created_at").first()
    count = BackupRecord.objects.count()
    if latest is None:
        return {"count": 0, "last_created_at": None, "age_hours": None, "size_mb": None, "stale": True}
    age = now - latest.created_at
    return {
        "count": count,
        "last_created_at": latest.created_at,
        "age_hours": round(age.total_seconds() / 3600, 1),
        "size_mb": round(latest.size_bytes / (1024 * 1024), 1),
        "stale": age > timedelta(days=BACKUP_STALE_DAYS),
    }


def build_admin_overview(user):
    now = timezone.now()
    today = timezone.localdate()
    return {
        "headcount": headcount(now),
        "coverage_gaps": coverage_gaps(today),
        "pending_backlog": pending_backlog(),
        "approval_aging": approval_aging(now),
        "leave_utilization": leave_utilization(today.year),
        "carryover_expiry": carryover_expiry(today),
        "period_close": period_close(today),
        "backup": backup_status(now) if user.is_superuser else None,
    }
