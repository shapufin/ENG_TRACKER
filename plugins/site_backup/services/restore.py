"""
Restore preview (read-only) and commit (destructive, transactional).
"""
import os
import shutil
import tempfile
from collections import defaultdict

from django.apps import apps as django_apps
from django.conf import settings
from django.core.management.color import no_style
from django.db import connection, transaction
from django.db.models import ProtectedError

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


# Models whose rows are frozen once their year is closed (item 31), keyed by
# label. A restore writes raw rows, so it must apply the same lock itself.
CLOSED_YEAR_LOCKED_MODELS = ('overtime.overtimelog', 'standby.standbylog')

# Fields that grant or remove access. A restore may carry them from the file
# into the live database, so they are listed and need a separate confirmation.
PRIVILEGE_FIELDS = {
    'auth.user': ('is_superuser', 'is_staff', 'is_active', 'password'),
    'users.userprofile': (
        'is_hr_user', 'is_italian_tl_role', 'is_albanian_tl_role', 'mfa_required',
        # A leader link grants approval rights and payroll scope (audit 2026-11-13).
        'italian_tl', 'albanian_tl',
    ),
}
ROLE_GRANT_MODEL = 'permissions.userrole'


def closed_year_conflicts(by_model, labels, delete_missing=()) -> dict:
    """Closed years a restore of ``labels`` would touch, as ``{label: [years]}``.

    A row is a conflict when it is created, overwritten or deleted inside a
    closed year (checked on both the file row and the live row).
    """
    from apps.users.models import ClosedYear

    closed = set(ClosedYear.objects.values_list('year', flat=True))
    if not closed:
        return {}
    conflicts = {}
    for label in CLOSED_YEAR_LOCKED_MODELS:
        if label not in labels:
            continue
        model = _model_from_label(label)
        file_rows = by_model.get(label, [])
        years = {
            d.object.date.year for d in file_rows
            if d.object.date is not None and d.object.date.year in closed
        }
        file_pks = {d.object.pk for d in file_rows}
        live = model._default_manager.filter(date__year__in=closed)
        for pk, row_date in live.values_list('pk', 'date'):
            if pk in file_pks or label in delete_missing:
                years.add(row_date.year)
        if years:
            conflicts[label] = sorted(years)
    return conflicts


def _closed_year_message(conflicts) -> str:
    parts = '; '.join(f"{label}: {', '.join(map(str, years))}" for label, years in sorted(conflicts.items()))
    return (
        f'Restore blocked: it would change records in a closed year ({parts}). Closed years '
        'are frozen. A superuser can reopen one with `manage.py reopen_year --year Y --reason "..."`, '
        'then restore again.'
    )


def privilege_changes(by_model, labels, delete_missing=()) -> list:
    """Access-granting changes a restore would make, for review before commit.

    Passwords are reported as "changed" only, never with a value.
    """
    changes = []
    for label, fields in PRIVILEGE_FIELDS.items():
        if label not in labels:
            continue
        model = _model_from_label(label)
        rows = by_model.get(label, [])
        live = model._default_manager.in_bulk([d.object.pk for d in rows])
        for deserialized in rows:
            obj = deserialized.object
            current = live.get(obj.pk)
            name = getattr(obj, 'username', None) or f'user #{getattr(obj, "user_id", obj.pk)}'
            for field in fields:
                new_value = getattr(obj, field)
                if current is None:
                    if field not in ('password', 'is_active') and new_value is True:
                        changes.append({
                            'model': label, 'pk': obj.pk, 'name': name, 'field': field,
                            'from': None, 'to': True,
                        })
                    continue
                old_value = getattr(current, field)
                if old_value != new_value:
                    secret = field == 'password'
                    changes.append({
                        'model': label, 'pk': obj.pk, 'name': name, 'field': field,
                        'from': 'set' if secret else old_value,
                        'to': 'changed' if secret else new_value,
                    })
    if ROLE_GRANT_MODEL in labels:
        model = _model_from_label(ROLE_GRANT_MODEL)
        rows = by_model.get(ROLE_GRANT_MODEL, [])
        file_pks = {d.object.pk for d in rows}
        existing = set(model._default_manager.values_list('pk', flat=True))
        for deserialized in rows:
            if deserialized.object.pk not in existing:
                obj = deserialized.object
                changes.append({
                    'model': ROLE_GRANT_MODEL, 'pk': obj.pk, 'name': f'user #{obj.user_id}',
                    'field': 'role granted', 'from': None, 'to': f'role #{obj.role_id}',
                })
        if ROLE_GRANT_MODEL in delete_missing:
            for pk in sorted(existing - file_pks):
                changes.append({
                    'model': ROLE_GRANT_MODEL, 'pk': pk, 'name': f'role grant #{pk}',
                    'field': 'role removed', 'from': 'granted', 'to': None,
                })
    return changes


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
    conflicts = {}
    privileges = []
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
        labels = set(by_model)
        conflicts = closed_year_conflicts(by_model, labels)
        privileges = privilege_changes(by_model, labels)

    media = _preview_media(archive) if manifest.get('includes_media') else {'new': 0, 'overwritten': 0, 'total': 0}

    return {
        'manifest': manifest,
        'schema_compatible': schema_compatible,
        'model_groups': model_groups,
        'closed_year_conflicts': conflicts,
        'privilege_changes': privileges,
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


def _stage_media(archive):
    """Validate and write every media member into a staging dir under MEDIA_ROOT.

    Nothing in place is touched, so a failure here leaves existing files intact.
    Returns ``(staging_dir, [(staged_path, final_path)])``; the caller must
    remove ``staging_dir`` (``shutil.rmtree``) when done.
    """
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

    os.makedirs(media_root, exist_ok=True)
    staging = tempfile.mkdtemp(prefix='.restore-staging-', dir=media_root)
    pairs = []
    written = 0
    try:
        for index, (info, target_path) in enumerate(zip(members, targets)):
            staged = os.path.join(staging, str(index))
            with archive.open(info) as src, open(staged, 'wb') as dst:
                # Headers can lie about the size: also bound the bytes really written.
                while chunk := src.read(1024 * 1024):
                    written += len(chunk)
                    if written > MAX_MEDIA_UNCOMPRESSED_BYTES:
                        raise RestoreError('Backup media exceeds the maximum allowed size.')
                    dst.write(chunk)
            pairs.append((staged, target_path))
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise
    return staging, pairs


def _install_media(pairs) -> int:
    for staged, target_path in pairs:
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        os.replace(staged, target_path)
    return len(pairs)


def _extract_media(archive) -> int:
    staging, pairs = _stage_media(archive)
    try:
        return _install_media(pairs)
    finally:
        shutil.rmtree(staging, ignore_errors=True)


def commit(
    file_obj,
    approved_models,
    delete_missing_models=None,
    restore_media: bool = False,
    confirmed: bool = False,
    confirm_privilege_changes: bool = False,
    user=None,
) -> dict:
    """Restore only the approved model groups (plus their forced dependents).

    ``delete_missing_models`` is a separate, explicit opt-in: rows that exist
    in the DB but not in the backup are only deleted for models listed here,
    never as a side effect of approving create/update for that model.

    A restore refuses to touch a closed year (``closed_year_conflicts``) and
    refuses to change access-granting fields unless
    ``confirm_privilege_changes`` is set after reviewing the preview.
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
    _remap_content_types(objects, manifest)
    by_model = {
        label: items for label, items in _group_by_model(objects).items() if label in expanded
    }

    conflicts = closed_year_conflicts(by_model, expanded, delete_missing)
    if conflicts:
        raise RestoreError(_closed_year_message(conflicts))
    privileges = privilege_changes(by_model, expanded, delete_missing)
    if privileges and not confirm_privilege_changes:
        raise RestoreError(
            f'Restore would change access for {len(privileges)} account field(s) '
            '(superuser, staff, active, password or role flags). Review the preview '
            'and confirm the privilege changes explicitly. Nothing was restored.'
        )

    result = {
        'created': {}, 'updated': {}, 'deleted': {}, 'media_extracted': 0,
        'privilege_changes': len(privileges),
    }

    staging = None
    try:
        with transaction.atomic():
            _commit_rows(expanded, graph, delete_missing, by_model, result)
            if restore_media:
                # Staged inside the transaction: a media error rolls the DB
                # back and leaves every existing file untouched.
                staging, media_pairs = _stage_media(archive)
        if restore_media:
            result['media_extracted'] = _install_media(media_pairs)
    finally:
        if staging:
            shutil.rmtree(staging, ignore_errors=True)

    refresh_after_restore()
    _log_restore(user, manifest, expanded, result)
    return result


def refresh_after_restore() -> None:
    """Rebuild what raw restore saves skip: the profile role-code cache (the signal returns on
    ``raw=True``) and every cached permission or closed-year answer."""
    from django.core.cache import cache

    from django.contrib.auth.models import User

    from apps.permissions.services.role_service import _refresh_role_cache
    from apps.users.services.approval_periods import clear_closed_year_cache

    for user in User.objects.select_related('profile').iterator():
        _refresh_role_cache(user)
    cache.clear()
    clear_closed_year_cache()


def _commit_rows(expanded, graph, delete_missing, by_model, result) -> None:
    for label in topological_delete_order(expanded, graph):
        if label not in delete_missing:
            result['deleted'][label] = 0
            continue
        model = _model_from_label(label)
        file_pks = {d.object.pk for d in by_model.get(label, [])}
        try:
            deleted_count, _ = model._default_manager.exclude(pk__in=file_pks).delete()
        except ProtectedError:
            raise RestoreError(
                f'Cannot delete the {label} rows missing from the backup: other '
                'records that must be kept still reference them. Nothing was restored.'
            )
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

    _reset_sequences(expanded)



def _remap_content_types(objects, manifest) -> None:
    """Re-point ContentType FKs at this database's ContentType PKs.

    ContentType rows are not in the fixture and their PKs differ between
    databases; the manifest's ``content_types`` map (old pk -> label) lets us
    resolve each reference by ``(app_label, model)``. Backups without the map
    are left as they are.
    """
    old_labels = manifest.get('content_types') or {}
    if not old_labels:
        return
    from django.contrib.contenttypes.models import ContentType

    current = {
        f'{app_label}.{model}': pk
        for pk, app_label, model in ContentType.objects.values_list('pk', 'app_label', 'model')
    }
    for deserialized in objects:
        obj = deserialized.object
        for field in obj._meta.concrete_fields:
            if not (field.is_relation and field.related_model is ContentType):
                continue
            old_pk = getattr(obj, field.attname)
            if old_pk is None:
                continue
            label = old_labels.get(str(old_pk))
            if label not in current:
                raise RestoreError(
                    f'Backup references content type {label or old_pk!r}, which does not '
                    'exist in this database. Nothing was restored.'
                )
            setattr(obj, field.attname, current[label])


def _reset_sequences(labels) -> None:
    """Advance PK sequences past the restored rows.

    ``deserialized.save()`` writes explicit PKs, which PostgreSQL does not
    count against the sequence (``loaddata`` resets them for the same reason);
    without this the first normal insert after a restore hits a duplicate key.
    SQLite returns no statements.
    """
    models = [_model_from_label(label) for label in labels]
    statements = connection.ops.sequence_reset_sql(no_style(), models)
    if statements:
        with connection.cursor() as cursor:
            for statement in statements:
                cursor.execute(statement)


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
