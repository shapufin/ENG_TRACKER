"""Orchestration for closing a year: lock, readiness, build, verify (plan Y3).

``ClosedYear`` is written only after every file in the set is ready, so a
half-built year can never look frozen.
"""
from __future__ import annotations

import logging
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.users.services.approval_periods import close_year as freeze_year, record_year_event
from core.utils.timezone_local import business_today

from ..models import YearSnapshot, YearSnapshotFile
from . import builder
from .readiness import apply_year_end_rollover, check_year_readiness, is_year_eligible

logger = logging.getLogger(__name__)

# A build that has been "building" for longer than this was interrupted.
STALE_BUILD_AFTER = timedelta(hours=1)


def latest_snapshot(year: int) -> YearSnapshot | None:
    return YearSnapshot.objects.filter(year=year).order_by('-version').first()


def _lock_snapshot(year: int, retry: bool) -> tuple[YearSnapshot, bool]:
    """Return ``(snapshot, should_build)``, serialising concurrent closers."""
    latest = latest_snapshot(year)
    if latest is not None and latest.status == 'ready' and not retry:
        return latest, False
    # With --retry the build still runs: it drops file rows whose bundle no
    # longer exists and rebuilds only what failed. The scheduler's own early
    # return (process_close_year) is what keeps a ready year cheap.

    if latest is not None and latest.status == 'building':
        started = latest.started_at or latest.updated_at
        if started and timezone.now() - started < STALE_BUILD_AFTER:
            return latest, False  # another worker is on it

    if latest is not None and latest.status != 'superseded':
        latest = YearSnapshot.objects.select_for_update().get(pk=latest.pk)
        return latest, True

    version = (latest.version + 1) if latest is not None else 1
    # Two workers can both arrive here having seen no row (or the same
    # superseded one). The unique (year, version) constraint decides the race:
    # the loser gets the winner's row and must not also build.
    snapshot, created = YearSnapshot.objects.get_or_create(
        year=year, version=version, defaults={'status': 'building'},
    )
    return snapshot, created


def supersede_if_reopened(year: int) -> bool:
    """Retire a ready set whose year is no longer frozen (audit 2026-11-17 C1).

    ``_finalize`` freezes the year right after the set turns ready, so a ready set
    without a ``ClosedYear`` row means ``reopen_year`` ran since: its files no longer
    describe the data. Marking it superseded makes the next close build version N+1
    from scratch. Read straight from the database, never through the 60-second
    closed-year cache, and kept here (not in a reopen receiver) so it also works when
    the plugin was disabled while the year was reopened.
    """
    from apps.users.models import ClosedYear

    if ClosedYear.objects.filter(year=year).exists():
        return False
    if not YearSnapshot.objects.filter(year=year, status='ready').exists():
        return False
    YearSnapshot.objects.filter(year=year).exclude(status='superseded').update(
        status='superseded', updated_at=timezone.now(),
    )
    logger.info('Year %s was reopened: its archive set is superseded.', year)
    return True


def close_year(year: int, *, actor=None, retry: bool = False) -> YearSnapshot:
    """Build (or retry) the snapshot set for ``year``.

    Idempotent: a ready, frozen year is returned untouched. A ready set of a year
    that was reopened is superseded and rebuilt as a new version. ``retry``
    rebuilds only the files that failed.
    """
    if not is_year_eligible(year):
        # select_for_update needs a transaction (PostgreSQL raises outside one; audit M1).
        with transaction.atomic():
            snapshot, _ = _lock_snapshot(year, retry=False)
            snapshot.readiness = check_year_readiness(year)
            snapshot.status = 'blocked'
            snapshot.save(update_fields=['readiness', 'status', 'updated_at'])
        return snapshot

    supersede_if_reopened(year)

    # The snapshot must record post-rollover balances, so roll over first.
    apply_year_end_rollover()

    readiness = check_year_readiness(year)
    with transaction.atomic():
        snapshot, should_build = _lock_snapshot(year, retry=retry)
        if not should_build:
            return snapshot
        unchanged = (
            snapshot.status == 'blocked'
            and (snapshot.readiness or {}).get('blockers') == readiness['blockers']
        )
        snapshot.readiness = readiness
        if readiness['blockers']:
            snapshot.status = 'blocked'
            snapshot.save(update_fields=['readiness', 'status', 'updated_at'])
            if not unchanged:
                # The scheduler retries hourly: log and announce a change, not every tick (H4).
                record_year_event(
                    actor, 'UPDATE', year, 'year_close_blocked',
                    extra={'blockers': readiness['blockers'], 'version': snapshot.version},
                )
                transaction.on_commit(
                    lambda: notify_attention(year, 'blocked', readiness['blockers'])
                )
            return snapshot
        snapshot.status = 'building'
        snapshot.started_at = timezone.now()
        snapshot.save(update_fields=['readiness', 'status', 'started_at', 'updated_at'])
    record_year_event(
        actor, 'UPDATE', year,
        'year_close_retry' if retry else 'year_close_build',
        extra={'version': snapshot.version},
    )

    _build(snapshot, readiness['warnings'], retry=retry)
    return _finalize(snapshot, actor)


def _build(snapshot: YearSnapshot, warnings: list[str], *, retry: bool) -> None:
    year = snapshot.year
    bundles = builder.bundles_for_year(year)
    gap = builder.completeness_gap(year, bundles)
    if gap:
        # Refuse to publish a set that silently drops rows.
        snapshot.status = 'failed'
        snapshot.readiness = {
            **(snapshot.readiness or {}),
            'error': f'{len(gap)} user(s) with rows in {year} belong to no bundle.',
        }
        snapshot.save(update_fields=['status', 'readiness', 'updated_at'])
        logger.error('Year %s close failed: %s users uncovered', year, len(gap))
        notify_attention(year, 'failed', [snapshot.readiness['error']])
        return

    plan = [
        ('team' if bundle['kind'] == 'team' else 'unassigned', bundle)
        for bundle in bundles
    ]
    # A structure change (team deleted, members reassigned) leaves rows behind
    # that the current plan no longer produces; they would keep the set looking
    # complete and end up in the manifest as evidence that was never built now.
    names = [f'{year}/{builder.bundle_filename(bundle)}' for _, bundle in plan]
    if len(names) != len(set(names)):  # assign_filenames makes them unique; never trust it blindly
        snapshot.status = 'failed'
        snapshot.readiness = {**(snapshot.readiness or {}), 'error': 'Two bundles share a file name.'}
        snapshot.save(update_fields=['status', 'readiness', 'updated_at'])
        notify_attention(year, 'failed', [snapshot.readiness['error']])
        return
    planned = set(names)
    planned |= {f'{year}/company_{year}.zip', f'{year}/MANIFEST.json'}
    for row in snapshot.files.exclude(relative_path__in=planned):
        (builder.snapshot_root() / row.relative_path).unlink(missing_ok=True)
    snapshot.files.exclude(relative_path__in=planned).delete()

    for kind, bundle in plan:
        relative = f'{year}/{builder.bundle_filename(bundle)}'
        file_row, _ = YearSnapshotFile.objects.get_or_create(
            snapshot=snapshot,
            relative_path=relative,
            defaults={
                'kind': kind,
                'leader_name': bundle['leader_name'],
                'team_name': bundle['team_name'],
            },
        )
        if file_row.status == 'ready':
            continue  # with or without --retry, only failed or new files are built
        _build_file(file_row, lambda b=bundle: builder.build_bundle(year, b, warnings))

    company_row, _ = YearSnapshotFile.objects.get_or_create(
        snapshot=snapshot,
        relative_path=f'{year}/company_{year}.zip',
        defaults={'kind': 'company'},
    )
    if not (company_row.status == 'ready'):
        _build_file(company_row, lambda: builder.build_company(year, warnings))

    manifest_row, _ = YearSnapshotFile.objects.get_or_create(
        snapshot=snapshot,
        relative_path=f'{year}/MANIFEST.json',
        defaults={'kind': 'manifest'},
    )
    _build_file(manifest_row, lambda: _build_manifest(snapshot, warnings))


def _build_file(file_row: YearSnapshotFile, build) -> None:
    try:
        path, _counts = build()
        file_row.status = 'ready'
        file_row.error = ''
        # POSIX form: the path is stored, compared and served, and a Windows
        # backslash here would rewrite the row's unique key on every run.
        file_row.relative_path = path.relative_to(builder.snapshot_root()).as_posix()
        file_row.size = path.stat().st_size
        file_row.sha256 = builder.sha256_file(path)
    except Exception as exc:  # noqa: BLE001 - one failed file never blocks the others
        logger.exception('Year-close file %s failed', file_row.relative_path)
        file_row.status = 'failed'
        file_row.error = str(exc)[:2000]
    file_row.save()


def _build_manifest(snapshot: YearSnapshot, warnings: list[str]):
    files = [
        {
            'path': row.relative_path,
            'kind': row.kind,
            'leader': row.leader_name,
            'team': row.team_name,
            'bytes': row.size,
            'sha256': row.sha256,
            'status': row.status,
        }
        for row in snapshot.files.exclude(kind='manifest').order_by('relative_path')
    ]
    manifest, _digest = builder.write_set_manifest(
        snapshot.year, files, warnings, builder_counts(snapshot),
    )
    return manifest, {}


def builder_counts(snapshot: YearSnapshot) -> dict:
    from .readiness import pending_counts

    counts = pending_counts(snapshot.year)
    counts.update(_company_counts(snapshot.year))
    return counts


def _company_counts(year: int) -> dict:
    """Counts the company ZIP recorded (payroll months, scorecard, EPR, ...)."""
    import json
    import zipfile

    path = builder.snapshot_root() / str(year) / f'company_{year}.zip'
    if not path.exists():
        return {}
    with zipfile.ZipFile(path) as archive:
        return json.loads(archive.read('MANIFEST.json')).get('counts', {})


def _count_drift(snapshot: YearSnapshot, files) -> str:
    """Reason text when the bundles no longer hold what the database holds, else ''.

    Bundles are disjoint by user and by row, so their counts must add up to the live
    year counts. Checked last, right before the freeze, because nothing locks the year's
    rows while the set is built (audit 2026-11-17 M4).
    """
    import json
    import zipfile

    from .readiness import pending_counts

    totals = {'overtime': 0, 'standby': 0, 'leave': 0}
    for row in files:
        if row.kind not in ('team', 'unassigned'):
            continue
        with zipfile.ZipFile(builder.snapshot_root() / row.relative_path) as archive:
            counts = json.loads(archive.read('MANIFEST.json')).get('counts', {})
        for key in totals:
            totals[key] += counts.get(key, 0)
    live = pending_counts(snapshot.year)
    differ = [f'{key} {totals[key]} archived vs {live[key]} now' for key in totals if totals[key] != live[key]]
    if not differ:
        return ''
    return 'Rows changed while the set was built (' + ', '.join(differ) + '); it is rebuilt on the next run.'


def _finalize(snapshot: YearSnapshot, actor) -> YearSnapshot:
    snapshot.refresh_from_db()
    # ``_build`` can abort before writing any file (completeness gap); that is a
    # failure, never an empty "ready" set.
    if snapshot.status in ('failed', 'blocked'):
        return snapshot
    files = list(snapshot.files.all())
    if not files:
        snapshot.status = 'failed'
        snapshot.completed_at = timezone.now()
        snapshot.save(update_fields=['status', 'completed_at', 'updated_at'])
        return snapshot
    failed = [row for row in files if row.status != 'ready']
    if failed:
        snapshot.status = 'failed'
        snapshot.completed_at = timezone.now()
        snapshot.save(update_fields=['status', 'completed_at', 'updated_at'])
        notify_attention(snapshot.year, 'failed', sorted(
            f'{row.relative_path}: {row.error[:200]}' for row in failed
        ))
        return snapshot

    drift = _count_drift(snapshot, files)
    if drift:
        # Rows changed while the set was built: rebuild every bundle on the next run (M4).
        snapshot.files.filter(kind__in=('team', 'unassigned')).update(status='pending', error=drift)
        snapshot.status = 'failed'
        snapshot.readiness = {**(snapshot.readiness or {}), 'error': drift}
        snapshot.completed_at = timezone.now()
        snapshot.save(update_fields=['status', 'readiness', 'completed_at', 'updated_at'])
        notify_attention(snapshot.year, 'failed', [drift])
        return snapshot

    snapshot.status = 'ready'
    snapshot.completed_at = timezone.now()
    snapshot.total_bytes = sum(row.size for row in files)
    snapshot.save(update_fields=['status', 'completed_at', 'total_bytes', 'updated_at'])
    freeze_year(
        snapshot.year, actor=actor, snapshot_ref=f'{snapshot.year}/v{snapshot.version}',
    )
    return snapshot


def notify_attention(year: int, status: str, reasons: list[str]) -> None:
    """Tell superusers a due year is blocked or failed (H4). Never blocks the close."""
    try:
        from ..notification_types import YearCloseAttentionNotice
    except ImportError:  # notifications plugin not installed
        return
    try:
        YearCloseAttentionNotice().dispatch({'year': year, 'status': status, 'reasons': reasons})
    except Exception:  # noqa: BLE001 - a notice must never fail the close itself
        logger.exception('Year-close notice for %s failed', year)


def years_to_process() -> list[int]:
    """Last year, plus any older year the scheduler already started and did not finish.

    A year that was never started stays a deliberate ``manage.py close_year --year``
    decision; one that was started (blocked, failed, reopened) is not abandoned on
    1 January (H4).
    """
    from apps.users.models import ClosedYear

    years = {business_today().year - 1}
    years |= set(
        YearSnapshot.objects.exclude(status__in=('ready', 'superseded'))
        .values_list('year', flat=True)
    )
    years |= set(
        YearSnapshot.objects.filter(status='ready')
        .exclude(year__in=ClosedYear.objects.values('year'))
        .values_list('year', flat=True)
    )
    return sorted(year for year in years if is_year_eligible(year))


def process_close_year() -> None:
    """Scheduler entry: close every due year. Cheap when nothing to do."""
    for year in years_to_process():
        existing = latest_snapshot(year)
        if existing is not None and existing.status == 'ready' and not supersede_if_reopened(year):
            continue
        close_year(year)
