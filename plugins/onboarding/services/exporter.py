"""Builds onboarding ZIPs for ``ClientExport`` rows and keeps the export volume tidy.

Run by the scheduler (``process_exports`` every 10 s, ``cleanup_exports`` hourly).
In dev and tests ``EXPORT_JOBS_INLINE`` builds the file at request time instead.
"""
import hashlib
import logging
import os
import re
from collections import defaultdict
from datetime import timedelta
from pathlib import Path
import zipfile

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.overtime.models.core import Client

from ..models import ClientExport, Document, Folder

logger = logging.getLogger(__name__)

EXPORT_LIFETIME = timedelta(hours=24)
STUCK_AFTER = timedelta(hours=2)
SUBDIR = 'onboarding'
CHUNK = 1024 * 1024
_UNSAFE = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
_RESERVED = {'CON', 'PRN', 'AUX', 'NUL', *(f'COM{i}' for i in range(1, 10)), *(f'LPT{i}' for i in range(1, 10))}


def safe_component(name: str) -> str:
    """One path segment that is legal on Windows, macOS and Linux."""
    cleaned = _UNSAFE.sub('_', str(name)).strip().rstrip('. ') or '_'
    if cleaned.split('.')[0].upper() in _RESERVED:
        cleaned = f'_{cleaned}'
    return cleaned[:120]


def _unique(name: str, taken: set) -> str:
    """``name``, or ``name (2)``, ``name (3)``... so sanitised names never overwrite each other."""
    candidate, counter = name, 2
    stem, dot, ext = name.rpartition('.')
    while candidate.lower() in taken:
        candidate = f'{stem} ({counter}).{ext}' if dot and stem else f'{name} ({counter})'
        counter += 1
    taken.add(candidate.lower())
    return candidate


def request_export(user, kind, client=None) -> ClientExport:
    """Queue an export; build it right away when ``EXPORT_JOBS_INLINE`` is on."""
    for_client = kind == ClientExport.KIND_CLIENT and client is not None
    export = ClientExport.objects.create(
        kind=kind,
        client=client if for_client else None,
        client_code=client.code if for_client else '',
        client_name=client.name if for_client else '',
        requested_by=user,
    )
    if getattr(settings, 'EXPORT_JOBS_INLINE', False):
        build_export(export)
        export.refresh_from_db()
    return export


def _clients_for(export):
    if export.kind == ClientExport.KIND_ALL:
        return list(Client.objects.order_by('code'))
    return [export.client] if export.client_id else []


def _folder_paths(client):
    """``{folder_id: "Parent/Child"}`` with sanitised, per-parent-unique segment names."""
    folders = {f.id: f for f in Folder.objects.filter(client=client)}
    taken = defaultdict(set)
    paths = {}

    def resolve(folder):
        if folder.id not in paths:
            parent_path = resolve(folders[folder.parent_id]) if folder.parent_id in folders else ''
            segment = _unique(safe_component(folder.name), taken[parent_path])
            paths[folder.id] = f'{parent_path}/{segment}' if parent_path else segment
        return paths[folder.id]

    for folder in sorted(folders.values(), key=lambda f: (f.parent_id or 0, f.name.lower())):
        resolve(folder)
    return paths


def _client_entries(client):
    """``([(zip_path, document)], folder_count)`` for one client."""
    paths = _folder_paths(client)
    top = safe_component(f'{client.code} - {client.name}')
    taken = defaultdict(set)
    entries = []
    for document in Document.objects.filter(client=client).order_by('folder_id', 'name'):
        directory = paths.get(document.folder_id, '') if document.folder_id else ''
        filename = _unique(safe_component(document.name), taken[directory])
        entries.append(('/'.join(p for p in (top, directory, filename) if p), document))
    return entries, len(paths)


def _sha256_of(path) -> str:
    digest = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(CHUNK), b''):
            digest.update(chunk)
    return digest.hexdigest()


def _copy_into(archive, zip_path, source) -> str:
    """Stream ``source`` into the archive (never loading it whole); returns its sha256."""
    digest = hashlib.sha256()
    with open(source, 'rb') as fh, archive.open(zip_path, 'w', force_zip64=True) as out:
        for chunk in iter(lambda: fh.read(CHUNK), b''):
            digest.update(chunk)
            out.write(chunk)
    return digest.hexdigest()


def _write_zip(export, target):
    """Write the ZIP to ``target`` and return ``(folders, documents)``."""
    folders = documents = 0
    manifest = [f'Onboarding export #{export.pk} ({export.kind})', f'Created: {timezone.now().isoformat()}', '',
                'sha256  path']
    missing = []
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
        for client in _clients_for(export):
            entries, folder_count = _client_entries(client)
            folders += folder_count
            for zip_path, document in entries:
                try:
                    digest = _copy_into(archive, zip_path, document.file.path)
                except (FileNotFoundError, ValueError):
                    # A file gone from disk must not sink the whole export.
                    missing.append(zip_path)
                    continue
                documents += 1
                manifest.append(f'{digest}  {zip_path}')
        manifest += ['', f'Folders: {folders}  Documents: {documents}', f'MISSING files: {len(missing)}']
        manifest += [f'MISSING  {path}' for path in missing]
        archive.writestr('MANIFEST.txt', '\n'.join(manifest) + '\n')
    return folders, documents


def build_export(export: ClientExport) -> None:
    """Build the ZIP for ``export``; never raises, a failure is stored on the row."""
    root = Path(settings.EXPORT_ROOT)
    relative = f'{SUBDIR}/{export.pk}.zip'
    final = root / relative
    part = final.with_name(final.name + '.part')
    ClientExport.objects.filter(pk=export.pk).update(status='running', started_at=timezone.now(), error='')
    try:
        final.parent.mkdir(parents=True, exist_ok=True)
        folders, documents = _write_zip(export, part)
        os.replace(part, final)
        now = timezone.now()
        ClientExport.objects.filter(pk=export.pk).update(
            status='ready', folders=folders, documents=documents, bytes=final.stat().st_size,
            sha256=_sha256_of(final), relative_path=relative, completed_at=now,
            expires_at=now + EXPORT_LIFETIME,
        )
        export.refresh_from_db()
    except Exception as exc:
        logger.exception('Onboarding export %s failed', export.pk)
        for leftover in (part, final):
            leftover.unlink(missing_ok=True)
        now = timezone.now()
        ClientExport.objects.filter(pk=export.pk).update(
            status='failed', error=str(exc)[:1000], completed_at=now, expires_at=now + EXPORT_LIFETIME,
        )
        export.refresh_from_db()


def process_client_exports() -> None:
    """Scheduler job: fail exports stuck in ``running``, then build pending ones oldest first."""
    ClientExport.objects.filter(status='running', started_at__lt=timezone.now() - STUCK_AFTER).update(
        status='failed',
        error='Export was interrupted (the worker stopped); request it again.',
        completed_at=timezone.now(),
    )
    while True:
        with transaction.atomic():
            export = (
                ClientExport.objects.select_for_update(skip_locked=True)
                .filter(status='pending').order_by('created_at', 'id').first()
            )
            if export is None:
                return
            ClientExport.objects.filter(pk=export.pk).update(status='running', started_at=timezone.now())
        build_export(export)


def cleanup_expired_exports() -> None:
    """Scheduler job: delete the file of every export past ``expires_at``."""
    root = Path(settings.EXPORT_ROOT)
    for export in ClientExport.objects.filter(status__in=['ready', 'failed'], expires_at__lt=timezone.now()):
        if export.relative_path:
            (root / export.relative_path).unlink(missing_ok=True)
        ClientExport.objects.filter(pk=export.pk).update(status='expired', download_nonce='')
