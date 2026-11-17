"""Retention ledger, removal notices and the superuser-confirmed purge of archived years.

Nothing here runs on its own except ``process_notices`` (a notice, never a deletion).
A purge needs a superuser's explicit confirmation and passes every gate in
``check_purge``: the year is closed, the archive set is ready and every file still
matches its sealed sha256, the removal date has passed, and the final notice went out
at least 30 days ago. After a purge the archive ZIP is the only copy, so a missing or
altered file always refuses.

State lives in ``{SNAPSHOT_ROOT}/{year}/RETENTION.json`` (notices sent, categories
purged), next to the archive it describes and covered by the same volume backup, so it
needs no table and survives a database restore.
"""
import json
import os
from datetime import date, timedelta

from django.db import transaction
from django.db.models import ProtectedError
from django.utils import timezone

from core.utils.timezone_local import business_today

from .. import retention
from ..models import YearSnapshot
from . import archive_view, builder
from .archive_sets import _evidence_queryset, engagement_available, scorecard_available
from .readiness import payroll_available

LEDGER_NAME = 'RETENTION.json'
NOTICE_STAGES = (90, 30)
MIN_DAYS_AFTER_FINAL_NOTICE = 30
KEYS = [key for key, *_ in retention.CATEGORIES]


class PurgeRefused(Exception):
    def __init__(self, reasons):
        super().__init__('; '.join(reasons))
        self.reasons = reasons


# ------------------------------------------------------------------ ledger


def _ledger_path(year: int):
    return builder.snapshot_root() / str(year) / LEDGER_NAME


def read_ledger(year: int) -> dict:
    path = _ledger_path(year)
    data = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
    data.setdefault('notices', {})
    data.setdefault('purged', {})
    return data


def _write_ledger(year: int, data: dict) -> None:
    path = _ledger_path(year)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(data, indent=2, sort_keys=True), encoding='utf-8')
    os.replace(temp, path)  # atomic: a crash never leaves half a ledger


# ------------------------------------------------------------------ dates


def group_of(key: str) -> str:
    return 'payroll' if key == 'payroll' else 'standard'


def removal_on(year: int, key: str) -> date:
    years = retention.payroll_years() if group_of(key) == 'payroll' else retention.standard_years()
    return retention.removal_on(year, years)


def payroll_hold(year: int, key: str) -> str | None:
    """Why overtime/standby of ``year`` must stay: finalized payroll still points at it (L7).

    ``PayrollRunEntry.source_id`` is a plain integer, so the database would let the rows
    go, and the payroll Excel's paid-block sheet would silently skip them for the two
    years payroll outlives them. They are removable once that payroll is removed.
    """
    if key not in ('overtime', 'standby') or not payroll_available():
        return None
    from apps.overtime.models import OvertimeLog
    from apps.standby.models import StandbyLog
    from plugins.payroll.models import PayrollRunEntry

    model = OvertimeLog if key == 'overtime' else StandbyLog
    held = PayrollRunEntry.objects.filter(
        source_kind=key, run__status='finalized',
        source_id__in=model.objects.filter(date__year=year).values('id'),
    ).exists()
    if not held:
        return None
    return (
        f'Kept until the {year} payroll is removed (from {removal_on(year, "payroll").isoformat()}): '
        f'finalized payroll still points at these {key} entries.'
    )


def category_state(year: int, key: str, today=None) -> dict:
    """Light state for the Archives list (no file hashing)."""
    today = today or business_today()
    ledger = read_ledger(year)
    purged = ledger['purged'].get(key)
    hold = payroll_hold(year, key)
    return {
        'removable': today > removal_on(year, key) and hold is None,
        'hold': hold,
        'purged_at': purged['purged_at'] if purged else None,
        'notice_sent_on': ledger['notices'].get(group_of(key), {}).get('30'),
    }


# ------------------------------------------------------------------ notices


def _dispatch(year: int, group: str, remove_on: date, days: int) -> bool:
    try:
        from ..notification_types import ArchiveRemovalNotice
    except ImportError:  # pragma: no cover - notifications plugin not installed
        return False
    ArchiveRemovalNotice().dispatch(
        {'year': year, 'group': group, 'remove_on': remove_on, 'days': days})
    return True


def process_notices(today=None) -> int:
    """Send each year's due removal notice once per retention group.

    The latest due stage is sent; earlier due stages are recorded as covered by it,
    so a late first run never sends two notices at once. Returns notices sent."""
    today = today or business_today()
    sent = 0
    years = YearSnapshot.objects.filter(status='ready').values_list('year', flat=True).distinct()
    for year in sorted(set(years)):
        ledger = read_ledger(year)
        changed = False
        for group, key in (('standard', 'overtime'), ('payroll', 'payroll')):
            remove_on = removal_on(year, key)
            notices = ledger['notices'].setdefault(group, {})
            due = [s for s in NOTICE_STAGES if today >= remove_on - timedelta(days=s)]
            if not due or all(str(s) in notices for s in due):
                continue
            if not _dispatch(year, group, remove_on, min(due)):
                continue
            for stage in due:
                notices.setdefault(str(stage), today.isoformat())
            changed = True
            sent += 1
        if changed:
            _write_ledger(year, ledger)
    return sent


def process_notices_tick() -> None:
    """Scheduler entry (daily). Notices only: this never deletes anything."""
    process_notices()


# ------------------------------------------------------------------ content checks


def live_count(year: int, count_key: str):
    """What the database holds now for one manifest count, or ``None`` when unknown.

    Same filters as the build (``readiness.pending_counts`` and ``archive_sets``), so a
    purge compares like with like.
    """
    from .readiness import pending_counts

    if count_key in ('overtime', 'standby', 'leave'):
        return pending_counts(year)[count_key]
    if count_key == 'payroll_months':
        if not payroll_available():
            return None
        from plugins.payroll.models import PayrollRun

        return PayrollRun.objects.filter(year=year, status='finalized').count()
    if not scorecard_available():
        return None
    from plugins.tl_scorecard.models import (
        Absence, EPRCycle, IdleFlag, Meeting, PIPRecord, PromotionFlag, ScorecardMonthSnapshot,
    )

    if count_key == 'scorecard_months':
        return ScorecardMonthSnapshot.objects.filter(month__year=year).count()
    if count_key == 'epr_cycles':
        return EPRCycle.objects.filter(year=year, is_deleted=False).count()
    if count_key == 'governance_evidence':
        return _evidence_queryset(year).count()
    if count_key == 'leader_records':
        return sum(queryset.count() for queryset in (
            IdleFlag.objects.filter(flagged_on__year=year, is_deleted=False),
            Absence.objects.filter(absence_date__year=year, is_deleted=False),
            PIPRecord.objects.filter(start_date__year=year, is_deleted=False),
            Meeting.objects.filter(occurred_on__year=year, is_deleted=False),
            PromotionFlag.objects.filter(nominated_on__year=year, is_deleted=False),
        ))
    if count_key == 'engagement_months':
        if not engagement_available():
            return None
        from plugins.engagement.models import TLApprovalMetric

        return TLApprovalMetric.objects.filter(month__year=year).count()
    return None


def _count_mismatch(year: int, key: str) -> str | None:
    """A reason when the archive and the database disagree on this category (C1).

    The sha256 check only proves the files are the ones that were written; this proves
    they still describe the rows a purge is about to delete.
    """
    count_key = next(ck for k, _label, ck, *_ in retention.CATEGORIES if k == key)
    archived = archive_view._set_counts(year).get(count_key)
    live = live_count(year, count_key)
    if archived is None or live is None or archived == live:
        return None
    return (
        f'The archive holds {archived} {count_key.replace("_", " ")} row(s) of {year} but the '
        f'database has {live}. Rebuild the archive (reopen the year and close it again) '
        f'before removing anything.'
    )


def needs_confirmation(year: int, snapshot=None) -> bool:
    """A set rebuilt after a reopen (version > 1) needs a superuser's confirmation (D3)."""
    snapshot = snapshot or _ready_snapshot(year)
    if snapshot is None or snapshot.version <= 1:
        return False
    confirmed = read_ledger(year).get('confirmed_snapshot') or {}
    return confirmed.get('version') != snapshot.version


def confirm_snapshot(year: int, actor=None) -> dict:
    """Record that a superuser checked the rebuilt set of ``year`` (owner decision D3).

    Refuses (``PurgeRefused``) unless there is a ready set and every file still matches
    its sha256. Written to ``RETENTION.json`` next to the archive, and audited.
    """
    snapshot = _ready_snapshot(year)
    if snapshot is None:
        raise PurgeRefused([f'There is no ready archive set for {year}.'])
    bad = [
        row.relative_path for row in snapshot.files.all()
        if row.status != 'ready' or archive_view.verify_file(row) != 'ok'
    ]
    if bad:
        raise PurgeRefused([f'The archive could not be verified: {", ".join(bad)}.'])
    ledger = read_ledger(year)
    ledger['confirmed_snapshot'] = {
        'version': snapshot.version,
        'by': getattr(actor, 'username', ''),
        'at': timezone.now().isoformat(timespec='seconds'),
    }
    _write_ledger(year, ledger)
    try:
        from apps.reports.models import AuditLog
    except ImportError:  # pragma: no cover
        AuditLog = None
    if AuditLog is not None:
        AuditLog.objects.create(
            user=actor if getattr(actor, 'pk', None) else None,
            action='UPDATE',
            model_name='closedyear',
            object_id=str(year),
            object_repr=f'Archive set {year} v{snapshot.version} confirmed',
            extra_data={'operation': 'archive_set_confirmed', 'version': snapshot.version},
        )
    return {'year': year, 'version': snapshot.version}


# ------------------------------------------------------------------ gates


def _ready_snapshot(year: int):
    return (YearSnapshot.objects.filter(year=year, status='ready')
            .order_by('-version').first())


def check_purge(year: int, key: str, today=None) -> list[str]:
    """Reasons a purge must be refused; an empty list means every gate passed."""
    if key not in KEYS:
        return ['Unknown category.']
    today = today or business_today()
    ledger = read_ledger(year)
    if key in ledger['purged'] and not any(
        queryset.count() for _label, queryset, _delete in _plan(year, key)
    ):
        # Rows that came back (a database restored from before the purge) are not
        # "already removed": they pass the gates again and are removed once more.
        return [f"Already removed on {ledger['purged'][key]['purged_at'][:10]}."]

    from apps.users.models import ClosedYear

    reasons = []
    if not ClosedYear.objects.filter(year=year).exists():
        reasons.append(f'{year} is not closed.')
    snapshot = _ready_snapshot(year)
    if snapshot is None:
        reasons.append(f'There is no ready archive set for {year}.')
    else:
        bad = [
            row.relative_path for row in snapshot.files.all()
            if row.status != 'ready' or archive_view.verify_file(row) != 'ok'
        ]
        if bad:
            reasons.append(
                f'The archive could not be verified (missing, changed or failed): {", ".join(bad)}.')
        if needs_confirmation(year, snapshot):
            reasons.append(
                f'The {year} archive was rebuilt after the year was reopened (version '
                f'{snapshot.version}). A superuser must confirm it on the Archives page first.')
        mismatch = _count_mismatch(year, key)
        if mismatch:
            reasons.append(mismatch)
    remove_on = removal_on(year, key)
    if today <= remove_on:
        reasons.append(f'Kept until {remove_on.isoformat()}.')
    hold = payroll_hold(year, key)
    if hold:
        reasons.append(hold)
    final = ledger['notices'].get(group_of(key), {}).get('30')
    if not final or date.fromisoformat(final) > today - timedelta(days=MIN_DAYS_AFTER_FINAL_NOTICE):
        reasons.append('The final removal notice must have been sent at least 30 days ago.')
    if key == 'leave':
        from apps.leave_management.services.carry_over import is_closed_year

        if not is_closed_year(year):
            reasons.append(f'The {year} leave carry-over has not been applied yet.')
    return reasons


# ------------------------------------------------------------------ plans


def _plan(year: int, key: str) -> list[tuple]:
    """``[(label, queryset, delete?)]``: ``delete?`` False rows are removed by cascade
    and only counted, so a dry run reports everything that will go."""
    if key == 'payroll':
        if not payroll_available():
            return []
        from plugins.payroll.models import PayrollLine, PayrollRun, PayrollRunEntry

        runs = PayrollRun.objects.filter(year=year, status__in=('finalized', 'cancelled'))
        return [
            ('Payroll lines', PayrollLine.objects.filter(run__in=runs), False),
            ('Payroll source entries', PayrollRunEntry.objects.filter(run__in=runs), False),
            ('Payroll runs', runs, True),
        ]
    if key == 'overtime':
        from apps.overtime.models import OvertimeLog

        return [('Overtime entries', OvertimeLog.objects.filter(date__year=year), True)]
    if key == 'standby':
        from apps.standby.models import StandbyLog

        return [('Standby entries', StandbyLog.objects.filter(date__year=year), True)]
    if key == 'leave':
        from apps.leave_management.models import LeaveRequest

        # Fully inside the year only: a request that runs into the next year is
        # still part of that year's archive and goes with it.
        return [('Leave requests', LeaveRequest.objects.filter(
            start_date__year=year, end_date__year=year), True)]
    if not scorecard_available():
        return []
    from plugins.tl_scorecard.models import (
        Absence, EPRCycle, EPRStageRecord, IdleFlag, Meeting, PIPRecord, PromotionFlag,
        ScorecardMonthSnapshot,
    )

    if key == 'scorecard':
        return [('Scorecard months', ScorecardMonthSnapshot.objects.filter(month__year=year), True)]
    if key == 'epr':
        cycles = EPRCycle.objects.filter(year=year)
        return [
            ('EPR stage records', EPRStageRecord.objects.filter(cycle__in=cycles), False),
            ('EPR cycles', cycles, True),
        ]
    if key == 'engagement':
        if not engagement_available():
            return []
        from plugins.engagement.models import TLApprovalMetric

        return [('Engagement months', TLApprovalMetric.objects.filter(month__year=year), True)]
    if key == 'evidence':
        return [('HBPR evidence rows', _evidence_queryset(year), True)]
    if key == 'records':
        return [
            ('Idle flags', IdleFlag.objects.filter(flagged_on__year=year), True),
            ('Absences', Absence.objects.filter(absence_date__year=year), True),
            ('PIPs', PIPRecord.objects.filter(start_date__year=year), True),
            ('Meetings', Meeting.objects.filter(occurred_on__year=year), True),
            ('Promotion nominations', PromotionFlag.objects.filter(nominated_on__year=year), True),
        ]
    return []


# ------------------------------------------------------------------ purge


def purge(year: int, key: str, actor=None, dry_run: bool = True, today=None) -> dict:
    """Count (default) or remove the rows of one archived category.

    Raises ``PurgeRefused`` with every failed gate. A protected relation aborts the
    whole category: nothing is half-removed."""
    reasons = check_purge(year, key, today=today)
    if reasons:
        raise PurgeRefused(reasons)
    plan = _plan(year, key)
    rows = {label: queryset.count() for label, queryset, _delete in plan}
    if dry_run:
        return {'year': year, 'category': key, 'dry_run': True, 'rows': rows}
    try:
        with transaction.atomic():
            for _label, queryset, delete in plan:
                if delete:
                    queryset.delete()
    except ProtectedError as exc:
        raise PurgeRefused([f'Protected records block the removal: {exc.args[0]}']) from exc

    ledger = read_ledger(year)
    ledger['purged'][key] = {
        'purged_at': timezone.now().isoformat(timespec='seconds'),
        'rows': rows,
        'by': getattr(actor, 'username', ''),
    }
    _write_ledger(year, ledger)
    _audit(actor, year, key, rows)
    return {'year': year, 'category': key, 'dry_run': False, 'rows': rows}


def _audit(actor, year: int, key: str, rows: dict) -> None:
    try:
        from apps.reports.models import AuditLog
    except ImportError:  # pragma: no cover
        return
    AuditLog.objects.create(
        user=actor if getattr(actor, 'pk', None) else None,
        action='DELETE',
        model_name='closedyear',
        object_id=str(year),
        object_repr=f'Archived {key} of {year} removed',
        extra_data={'operation': 'archive_purge', 'category': key, 'rows': rows},
    )
