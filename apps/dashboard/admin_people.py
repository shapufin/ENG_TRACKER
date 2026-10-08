"""Role/tech distribution, approver speed and rejection analysis for the admin dashboard.

Plain aggregates over live data. Callers must already have verified the viewer
is staff/superuser. Averages across models are weighted (total time over total
decisions), never a mean of per-model means.
"""

from collections import defaultdict
from datetime import date, datetime, timedelta

from django.contrib.auth import get_user_model
from django.db.models import Count, DurationField, ExpressionWrapper, F, Q, Sum
from django.db.models.functions import Coalesce, Lower, Trim
from django.utils import timezone

from apps.leave_management.models import LeaveRequest
from apps.overtime.models import OvertimeLog
from apps.standby.models import StandbyLog
from apps.users.models.core import UserTech

from .admin_overview import employees_without_tl

User = get_user_model()

DECISION_WINDOW_DAYS = 30
APPROVER_LIMIT = 10
REASON_LIMIT = 5

_TYPES = (("overtime", OvertimeLog), ("standby", StandbyLog), ("leave", LeaveRequest))


def _roles():
    active = User.objects.filter(is_active=True)
    return active.aggregate(
        italian_tl=Count(
            "id",
            filter=Q(profile__is_italian_tl_role=True) | Q(profile__role_codes__icontains="italian_tl"),
        ),
        albanian_tl=Count(
            "id",
            filter=Q(profile__is_albanian_tl_role=True) | Q(profile__role_codes__icontains="albanian_tl"),
        ),
        hr=Count("id", filter=Q(profile__is_hr_user=True)),
        hbpr=Count("id", filter=Q(profile__role_codes__icontains="hbpr")),
        staff=Count("id", filter=Q(is_staff=True)),
        employees=Count("id", filter=Q(is_staff=False, is_superuser=False)),
    )


def _techs():
    rows = (
        UserTech.objects.filter(user_profile__user__is_active=True)
        .values("tech_id", "tech__name", "level__code", "level__name", "level__rank")
        .annotate(c=Count("id"))
    )
    by_tech = {}
    for r in rows:
        tech = by_tech.setdefault(
            r["tech_id"], {"tech_id": r["tech_id"], "name": r["tech__name"], "count": 0, "levels": []}
        )
        tech["count"] += r["c"]
        graded = r["level__code"] is not None
        tech["levels"].append(
            {
                "code": r["level__code"],
                "name": r["level__name"] if graded else "Ungraded",
                "rank": r["level__rank"] if graded else 0,
                "count": r["c"],
            }
        )
    out = sorted(by_tech.values(), key=lambda t: (-t["count"], t["name"]))
    for t in out:
        # graded levels by rank, Ungraded last
        t["levels"].sort(key=lambda lv: (lv["code"] is None, lv["rank"]))
    return out


def _submitted(model):
    return Coalesce("submitted_at", "created_at") if model is LeaveRequest else F("submitted_at")


def _approver_sla(now):
    since = now - timedelta(days=DECISION_WINDOW_DAYS)
    totals = defaultdict(lambda: {"decisions": 0, "approved": 0, "seconds": 0.0})
    for _, model in _TYPES:
        rows = (
            model.objects.filter(
                approved_by__isnull=False, approved_at__gte=since, status__in=("approved", "rejected")
            )
            .values("approved_by_id")
            .annotate(
                n=Count("id"),
                ok=Count("id", filter=Q(status="approved")),
                spent=Sum(
                    ExpressionWrapper(F("approved_at") - _submitted(model), output_field=DurationField())
                ),
            )
        )
        for r in rows:
            t = totals[r["approved_by_id"]]
            t["decisions"] += r["n"]
            t["approved"] += r["ok"]
            t["seconds"] += r["spent"].total_seconds() if r["spent"] else 0.0
    top = sorted(totals.items(), key=lambda kv: -kv[1]["decisions"])[:APPROVER_LIMIT]
    users = User.objects.in_bulk([uid for uid, _ in top])
    out = []
    for uid, t in top:
        u = users.get(uid)
        out.append(
            {
                "user_id": uid,
                "name": (u.get_full_name() or u.username) if u else f"User {uid}",
                "decisions_30d": t["decisions"],
                "approval_rate_pct": round(t["approved"] / t["decisions"] * 100, 1),
                "avg_decision_hours": round(t["seconds"] / t["decisions"] / 3600, 1),
            }
        )
    return out


def _rejections(today):
    month_start = today.replace(day=1)
    since = datetime.combine(month_start, datetime.min.time(), tzinfo=timezone.get_current_timezone())
    by_type, reasons = {}, defaultdict(int)
    for key, model in _TYPES:
        rejected = model.objects.filter(status="rejected", approved_at__gte=since)
        by_type[key] = rejected.count()
        for r in (
            rejected.annotate(norm_reason=Lower(Trim("rejection_reason")))
            .values("norm_reason")
            .annotate(c=Count("id"))
        ):
            if r["norm_reason"]:
                reasons[r["norm_reason"]] += r["c"]
    top = sorted(reasons.items(), key=lambda kv: (-kv[1], kv[0]))[:REASON_LIMIT]
    return {
        "month": month_start.strftime("%Y-%m"),
        "by_type": by_type,
        "top_reasons": [{"reason": reason, "count": count} for reason, count in top],
    }


def build_admin_people(user, today: date | None = None, now: datetime | None = None) -> dict:
    now = now or timezone.now()
    today = today or timezone.localdate()
    roles = _roles()
    roles["employees_without_tl"] = employees_without_tl()
    return {
        "roles": roles,
        "techs": _techs(),
        "approver_sla": _approver_sla(now),
        "rejections": _rejections(today),
    }
