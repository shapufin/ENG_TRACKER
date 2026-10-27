"""Freezing a TL's month-bound scorecard blocks (team lifecycle plan, Phase 5).

Separate from ``services`` on purpose: that module is pure reads, this one writes.
Run by the scheduler job ``process_freeze_scorecards`` and the management command
``freeze_scorecard_months``. Months before the feature shipped have no true snapshot;
the command can backfill one, but it then reflects today's membership.
"""
from datetime import date, datetime, timedelta

from django.contrib.auth.models import User
from django.utils import timezone

from core.utils.metrics_freeze import freeze_at, is_past_freeze
from core.utils.timezone_local import business_tz

from .models import ScorecardMonthSnapshot
from .scope import scoreable_member_ids
from .services import month_blocks


def target_month(now: datetime) -> date:
    """The latest month whose freeze moment has passed at ``now``."""
    candidate = now.astimezone(business_tz()).date().replace(day=1)
    while True:
        candidate = (candidate - timedelta(days=1)).replace(day=1)
        if is_past_freeze(candidate, now):
            return candidate


def _leaders():
    users = User.objects.filter(is_active=True, profile__isnull=False).select_related('profile')
    return [user for user in users if user.profile.is_team_leader]


def freeze_scorecard_months(now: datetime | None = None, month: date | None = None) -> int:
    """Snapshot every team leader's month blocks for ``month`` (default: latest frozen month).

    Returns how many snapshots were written. Idempotent, and cheap when the default
    month is already done: it returns before touching a single leader. Leaders without
    scoreable members are skipped. Raises ``ValueError`` for a month that is not past
    its freeze yet.
    """
    now = now or timezone.now()
    if month is None:
        month = target_month(now)
        if ScorecardMonthSnapshot.objects.filter(month=month, computed_at__gte=freeze_at(month)).exists():
            return 0
    else:
        month = month.replace(day=1)
        if not is_past_freeze(month, now):
            raise ValueError(f'{month:%Y-%m} is not frozen until {freeze_at(month):%Y-%m-%d}.')

    done = set(
        ScorecardMonthSnapshot.objects.filter(month=month, computed_at__gte=freeze_at(month))
        .values_list('leader_id', flat=True)
    )
    written = 0
    for leader in _leaders():
        if leader.pk in done:
            continue
        member_ids = scoreable_member_ids(leader)
        if not member_ids:
            continue
        ScorecardMonthSnapshot.objects.update_or_create(
            leader=leader, month=month,
            defaults={
                'member_ids': sorted(member_ids),
                'payload': month_blocks(leader, month, member_ids),
                'computed_at': now,
            },
        )
        written += 1
    return written


def process_freeze_scorecards() -> None:
    """Scheduler entry (hourly). Returns at once when the latest frozen month is done."""
    freeze_scorecard_months(now=timezone.now())
