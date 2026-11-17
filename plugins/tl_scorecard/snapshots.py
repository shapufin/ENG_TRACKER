"""Freezing a TL's month-bound scorecard blocks (team lifecycle plan, Phase 5).

Separate from ``services`` on purpose: that module is pure reads, this one writes.
Run by the scheduler job ``process_freeze_scorecards`` and the management command
``freeze_scorecard_months``. Months before the feature shipped have no true snapshot;
the command can backfill one, but it then reflects today's membership.
"""
from datetime import date, datetime, timedelta

from django.contrib.auth.models import User
from django.utils import timezone

from core.utils.metrics_freeze import freeze_at, is_frozen, is_past_freeze
from core.utils.timezone_local import business_today, business_tz

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
    """Active team leaders, resolved in SQL.

    Mirrors ``UserProfile.is_team_leader`` without calling it per user: that property
    costs up to three queries for someone who is not a leader, and the scheduler runs
    this hourly. ``role_codes`` is only a cache of ``UserRole``, so the role rows are
    authoritative here.
    """
    from apps.users.services.leader_ownership import leader_user_ids

    # One definition of a leader (audit 2026-11-13): never a second hand-written copy.
    return User.objects.filter(id__in=leader_user_ids(), profile__isnull=False).select_related('profile')


def snapshot_rosters() -> dict:
    """``{leader: scoreable member ids}`` for every leader the freeze job snapshots.

    The one rule for "who gets a month snapshot": active leaders with scoreable members.
    Year-close readiness asks the same question for December (audit 2026-11-17 H3), so
    it must call this, never re-derive it.
    """
    rosters = {}
    for leader in _leaders():
        member_ids = scoreable_member_ids(leader)
        if member_ids:
            rosters[leader] = member_ids
    return rosters


def freeze_scorecard_months(now: datetime | None = None, month: date | None = None) -> int:
    """Snapshot every team leader's month blocks for ``month`` (default: latest frozen month).

    Returns how many snapshots were written. Idempotent: leaders whose snapshot is
    already final are skipped by the ``done`` set (one query), never by a global
    "somebody is done" check — a run that died half-way must be completed by the next
    one. Leaders without scoreable members are skipped. Raises ``ValueError`` for a
    month that is not past its freeze yet.
    """
    now = now or timezone.now()
    if month is None:
        month = target_month(now)
    else:
        month = month.replace(day=1)
        if not is_past_freeze(month, now):
            raise ValueError(f'{month:%Y-%m} is not frozen until {freeze_at(month):%Y-%m-%d}.')

    done = set(
        ScorecardMonthSnapshot.objects.filter(month=month, computed_at__gte=freeze_at(month))
        .values_list('leader_id', flat=True)
    )
    written = 0
    for leader, member_ids in snapshot_rosters().items():
        if leader.pk in done:
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
    """Scheduler entry (hourly). Leaders already snapshotted are skipped."""
    freeze_scorecard_months(now=timezone.now())


def frozen_member_ids(leader, month: date, current_ids) -> set:
    """The team a leader had in ``month``: the final snapshot's roster once the
    month is frozen, today's roster otherwise (no true history exists before)."""
    snapshot = ScorecardMonthSnapshot.objects.filter(
        leader=leader, month=month.replace(day=1)).first()
    if snapshot is not None and is_frozen(snapshot.month, snapshot.computed_at):
        return set(snapshot.member_ids)
    return set(current_ids)


def epr_roster(leader, year: int, current_ids) -> set:
    """Roster for a year's EPR figures: live for this year, the frozen December
    roster for a closed one, so a past year does not move when teams change."""
    if year < business_today().year:
        return frozen_member_ids(leader, date(year, 12, 1), current_ids)
    return set(current_ids)
