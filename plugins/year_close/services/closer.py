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


def close_year(year: int, *, actor=None, retry: bool = False) -> YearSnapshot:
    """Build (or retry) the snapshot set for ``year``.

    Idempotent: a ready year is returned untouched. ``retry`` rebuilds only the
    files that failed.
    """
    if not is_year_eligible(year):
        snapshot, _ = _lock_snapshot(year, retry=False)
        snapshot.readiness = check_year_readiness(year)
        snapshot.status = 'blocked'
        snapshot.save(update_fields=['readiness', 'status', 'updated_at'])
        return snapshot

    # The snapshot must record post-rollover balances, so roll over first.
    apply_year_end_rollover()

    readiness = check_year_readiness(year)
    with transaction.atomic():
        snapshot, should_build = _lock_snapshot(year, retry=retry)
        if not should_build:
            return snapshot
        snapshot.readiness = readiness
        if readiness['blockers']:
            snapshot.status = 'blocked'
            snapshot.save(update_fields=['readiness', 'status', 'updated_at'])
            record_year_event(
                actor, 'UPDATE', year, 'year_close_blocked',
                extra={'blockers': readiness['blockers'], 'version': snapshot.version},
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
        return

    plan = [
        ('team' if bundle['kind'] == 'team' else 'unassigned', bundle)
        for bundle in bundles
    ]
    # A structure change (team deleted, members reassigned) leaves rows behind
    # that the current plan no longer produces; they would keep the set looking
    # complete and end up in the manifest as evidence that was never built now.
    planned = {f'{year}/{builder.bundle_filename(bundle)}' for _, bundle in plan}
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
        if file_row.status == 'ready' and not retry:
            continue
        if retry and file_row.status == 'ready':
            continue
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

    return pending_counts(snapshot.year)


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
        return snapshot

    snapshot.status = 'ready'
    snapshot.completed_at = timezone.now()
    snapshot.total_bytes = sum(row.size for row in files)
    snapshot.save(update_fields=['status', 'completed_at', 'total_bytes', 'updated_at'])
    freeze_year(
        snapshot.year, actor=actor, snapshot_ref=f'{snapshot.year}/v{snapshot.version}',
    )
    return snapshot


def process_close_year() -> None:
    """Scheduler entry: close last year when it is due. Cheap when nothing to do."""
    year = business_today().year - 1
    if not is_year_eligible(year):
        return
    existing = latest_snapshot(year)
    if existing is not None and existing.status == 'ready':
        return
    close_year(year)
