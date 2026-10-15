"""
Restore preview (read-only) and commit (destructive, transactional).
"""
import os
from collections import defaultdict

from django.apps import apps as django_apps
from django.conf import settings
from django.db import transaction

from .archive import open_archive, read_db_objects, read_manifest
from .backup import migration_state_hash
from .dependency_graph import (
    build_dependents_map,
    dependent_closure,
    topological_delete_order,
    topological_save_order,
)


class RestoreError(Exception):
    """Raised when a restore cannot proceed (blocked or misconfigured)."""


def _model_from_label(label: str):
    app_label, model_name = label.split('.')
    return django_apps.get_model(app_label, model_name)


def _group_by_model(deserialized_objects) -> dict:
    grouped = defaultdict(list)
    for deserialized in deserialized_objects:
        model = deserialized.object.__class__
        label = f'{model._meta.app_label}.{model._meta.model_name}'
        grouped[label].append(deserialized)
    return grouped


def _preview_media(archive) -> dict:
    media_root = str(settings.MEDIA_ROOT)
    new = overwritten = total = 0
    for name in archive.namelist():
        if not name.startswith('media/') or name.endswith('/'):
            continue
        total += 1
        rel_path = name[len('media/'):]
        if os.path.exists(os.path.join(media_root, rel_path)):
            overwritten += 1
        else:
            new += 1
    return {'new': new, 'overwritten': overwritten, 'total': total}


def preview(file_obj) -> dict:
    """Parse the archive and classify every model's rows. Issues no writes."""
    archive = open_archive(file_obj)
    manifest = read_manifest(archive)

    schema_compatible = manifest.get('migration_state_hash') == migration_state_hash()

    model_groups = []
    if schema_compatible:
        objects = read_db_objects(archive)
        by_model = _group_by_model(objects)
        graph = build_dependents_map()

        for label, deserialized_list in sorted(by_model.items()):
            model = _model_from_label(label)
            file_pks = {d.object.pk for d in deserialized_list}
            db_pks = set(model._default_manager.values_list('pk', flat=True))
            dependents = sorted(dependent_closure([label], graph) - {label})
            model_groups.append({
                'model': label,
                'file_count': len(file_pks),
                'db_count': len(db_pks),
                'new': len(file_pks - db_pks),
                'overwritten': len(file_pks & db_pks),
                'db_only': len(db_pks - file_pks),
                'forced_dependents': dependents,
            })

    media = _preview_media(archive) if manifest.get('includes_media') else {'new': 0, 'overwritten': 0, 'total': 0}

    return {
        'manifest': manifest,
        'schema_compatible': schema_compatible,
        'model_groups': model_groups,
        'media': media,
    }


# SEC-04: cap on the total uncompressed media a restore may write.
MAX_MEDIA_UNCOMPRESSED_BYTES = 4 * 1024 ** 3


def _safe_media_target(media_root: str, rel_path: str) -> str:
    """Resolve ``rel_path`` under ``media_root`` or raise (zip-slip guard).

    Same commonpath pattern as ``config.views.protected_media``.
    """
    target = os.path.normpath(os.path.join(media_root, rel_path))
    try:
        inside = os.path.commonpath([target, media_root]) == media_root
    except ValueError:  # different drives on Windows
        inside = False
    if not inside or target == media_root:
        raise RestoreError(f'Unsafe media path in backup: {rel_path!r}')
    return target


def _extract_media(archive) -> int:
    media_root = os.path.normpath(str(settings.MEDIA_ROOT))
    members = [
        info for info in archive.infolist()
        if info.filename.startswith('media/') and not info.filename.endswith('/')
    ]
    # Validate every member before writing anything.
    targets = [
        _safe_media_target(media_root, info.filename[len('media/'):])
        for info in members
    ]
    if sum(info.file_size for info in members) > MAX_MEDIA_UNCOMPRESSED_BYTES:
        raise RestoreError('Backup media exceeds the maximum allowed size.')

    count = 0
    written = 0
    for info, target_path in zip(members, targets):
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        with archive.open(info) as src, open(target_path, 'wb') as dst:
            # Headers can lie about the size: also bound the bytes really written.
            while chunk := src.read(1024 * 1024):
                written += len(chunk)
                if written > MAX_MEDIA_UNCOMPRESSED_BYTES:
                    raise RestoreError('Backup media exceeds the maximum allowed size.')
                dst.write(chunk)
        count += 1
    return count


def commit(
    file_obj,
    approved_models,
    delete_missing_models=None,
    restore_media: bool = False,
    confirmed: bool = False,
    user=None,
) -> dict:
    """Restore only the approved model groups (plus their forced dependents).

    ``delete_missing_models`` is a separate, explicit opt-in: rows that exist
    in the DB but not in the backup are only deleted for models listed here,
    never as a side effect of approving create/update for that model.
    """
    if not confirmed:
        raise RestoreError('Restore must be explicitly confirmed.')

    archive = open_archive(file_obj)
    manifest = read_manifest(archive)

    if manifest.get('migration_state_hash') != migration_state_hash():
        raise RestoreError(
            'Backup schema does not match the current database schema. Restore blocked.'
        )

    approved = set(approved_models)
    if not approved:
        raise RestoreError('No model groups were approved for restore.')

    graph = build_dependents_map()
    expanded = dependent_closure(approved, graph)
    delete_missing = set(delete_missing_models or []) & approved

    objects = read_db_objects(archive)
    by_model = {
        label: items for label, items in _group_by_model(objects).items() if label in expanded
    }

    result = {'created': {}, 'updated': {}, 'deleted': {}, 'media_extracted': 0}

    with transaction.atomic():
        for label in topological_delete_order(expanded, graph):
            if label not in delete_missing:
                result['deleted'][label] = 0
                continue
            model = _model_from_label(label)
            file_pks = {d.object.pk for d in by_model.get(label, [])}
            deleted_count, _ = model._default_manager.exclude(pk__in=file_pks).delete()
            result['deleted'][label] = deleted_count

        for label in topological_save_order(expanded, graph):
            model = _model_from_label(label)
            existing_pks = set(model._default_manager.values_list('pk', flat=True))
            created = updated = 0
            for deserialized in by_model.get(label, []):
                is_update = deserialized.object.pk in existing_pks
                deserialized.save()
                if is_update:
                    updated += 1
                else:
                    created += 1
            result['created'][label] = created
            result['updated'][label] = updated

        if restore_media:
            result['media_extracted'] = _extract_media(archive)

    _log_restore(user, manifest, expanded, result)
    return result


def _log_restore(user, manifest, restored_models, result) -> None:
    try:
        from plugins.audit_log.signals import log_action

        log_action(
            user,
            'other',
            description=(
                f"Site restore from backup dated {manifest.get('created_at', 'unknown')}: "
                f"{len(restored_models)} model group(s) restored."
            ),
            new_values=result,
        )
    except Exception:  # noqa: BLE001
        import logging

        logging.getLogger(__name__).exception('Failed to write the site restore audit entry')
