"""
Full-site backup creation: DB fixture (dumpdata) + media files, zipped.

Both the DB dump and the media zip stream to disk rather than buffering in
memory, so backup size is bounded by disk space, not RAM.
"""
import hashlib
import json
import os
import tempfile
import zipfile
from datetime import datetime, timezone as dt_timezone

import django
from django.apps import apps as django_apps
from django.conf import settings
from django.core.files import File
from django.core.management import call_command
from django.db import connection

from ..models import BackupRecord

MANIFEST_SCHEMA_VERSION = 1
EXCLUDED_APPS = ['contenttypes', 'sessions', 'site_backup']
BACKUPS_SUBDIR = 'backups'


def migration_state_hash() -> str:
    """Hash of every applied migration, used to gate restore onto a matching schema."""
    from django.db.migrations.recorder import MigrationRecorder

    recorder = MigrationRecorder(connection)
    applied = sorted(f'{app}.{name}' for app, name in recorder.applied_migrations())
    return hashlib.sha256('\n'.join(applied).encode()).hexdigest()


def dumpable_model_labels():
    """All installed models except the excluded apps, as ``app_label.model_name``."""
    labels = []
    for model in django_apps.get_models():
        app_label = model._meta.app_label
        if app_label in EXCLUDED_APPS:
            continue
        labels.append(f'{app_label}.{model._meta.model_name}')
    return labels


def _model_row_counts() -> dict:
    counts = {}
    for model in django_apps.get_models():
        app_label = model._meta.app_label
        if app_label in EXCLUDED_APPS:
            continue
        label = f'{app_label}.{model._meta.model_name}'
        try:
            counts[label] = model._default_manager.count()
        except Exception:
            continue
    return counts


def _sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def _write_db_dump(db_gz_path: str) -> None:
    """Stream dumpdata straight to a gzipped file on disk (no in-memory buffer).

    Deliberately *not* ``natural_foreign``/``natural_primary``: for any model
    that defines ``natural_key()`` (e.g. ``auth.Group``, ``auth.Permission``),
    those flags strip the PK from the fixture and Django's deserializer then
    re-resolves identity by natural key against whatever the DB looks like
    *at restore time* — silently reassigning PKs and breaking the PK-based
    new/overwritten/db_only classification the restore preview depends on.
    Plain PK-based dumps keep restore deterministic and engine-portable
    enough for this tool's dev=SQLite/prod=PostgreSQL use case.
    """
    call_command(
        'dumpdata',
        *dumpable_model_labels(),
        indent=None,
        output=db_gz_path,
    )


def _write_media(archive: zipfile.ZipFile) -> int:
    """Add every file under MEDIA_ROOT (except the backups store) to the zip."""
    media_root = str(settings.MEDIA_ROOT)
    excluded_dir = os.path.join(media_root, BACKUPS_SUBDIR)
    file_count = 0
    if not os.path.isdir(media_root):
        return 0
    for root, dirs, files in os.walk(media_root):
        if os.path.commonpath([root, excluded_dir]) == excluded_dir:
            dirs[:] = []
            continue
        for filename in files:
            full_path = os.path.join(root, filename)
            rel_path = os.path.relpath(full_path, media_root)
            archive.write(full_path, arcname=os.path.join('media', rel_path))
            file_count += 1
    return file_count


def create_backup(user, note: str = '', include_media: bool = True) -> BackupRecord:
    """Build one backup archive and persist it as a ``BackupRecord``."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        db_gz_path = os.path.join(tmp_dir, 'db.json.gz')
        _write_db_dump(db_gz_path)

        row_counts = _model_row_counts()
        state_hash = migration_state_hash()

        zip_path = os.path.join(tmp_dir, 'backup.zip')
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as archive:
            archive.write(db_gz_path, arcname='db.json.gz')
            media_count = _write_media(archive) if include_media else 0
            manifest = {
                'schema_version': MANIFEST_SCHEMA_VERSION,
                'created_at': datetime.now(dt_timezone.utc).isoformat(),
                'django_version': django.get_version(),
                'migration_state_hash': state_hash,
                'includes_media': include_media,
                'model_row_counts': row_counts,
                'media_file_count': media_count,
            }
            archive.writestr('manifest.json', json.dumps(manifest, indent=2))

        checksum = _sha256_file(zip_path)
        size_bytes = os.path.getsize(zip_path)
        filename = f"backup_{datetime.now(dt_timezone.utc):%Y%m%d_%H%M%S}.zip"

        record = BackupRecord(
            filename=filename,
            size_bytes=size_bytes,
            checksum=checksum,
            migration_state_hash=state_hash,
            db_row_count=sum(row_counts.values()),
            media_file_count=media_count,
            note=note,
            created_by=user,
        )
        with open(zip_path, 'rb') as fh:
            record.file.save(filename, File(fh), save=False)
        record.save()
        _log_backup(user, record)
        return record


def _log_backup(user, record: BackupRecord) -> None:
    try:
        from plugins.audit_log.signals import log_action

        log_action(
            user,
            'other',
            description=(
                f'Site backup created: {record.filename} '
                f'({record.db_row_count} DB rows, {record.media_file_count} media files).'
            ),
            obj=record,
        )
    except Exception:  # noqa: BLE001
        import logging

        logging.getLogger(__name__).exception('Failed to write the site backup audit entry')
