"""
ViewSets for the Universal Data Import plugin.

Endpoints:
- /targets/                       -> list importable targets with field schemas
- /targets/<key>/template/        -> download a CSV/XLSX sample for one target
- /profiles/                      -> CRUD for saved ImportProfile mappings
- /import/analyze/                -> detect columns, suggest mapping
- /import/preview/                -> validate all rows without writing
- /import/commit/                 -> commit the import
- /import/batches/                -> audit history
"""

import json
import logging
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
from django.db import transaction
from rest_framework import status, viewsets, permissions
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response

from core.mixins.permissions import PluginPermissionMixin
from core.utils.tabular_file import (
    read_tabular_file,
    suggest_mapping,
)
from apps.plugins.models import Plugin

from .models import ImportBatch, ImportProfile
from .upload_validation import validate_upload
from .serializers import ImportBatchSerializer, ImportProfileListSerializer, ImportProfileSerializer
from .importers.registry import get_importer, is_registered, list_importers
from .importers.base import ImportRowResult
from .parsing import _build_mapped_rows, _detected_values, _template_response

logger = logging.getLogger(__name__)

TEMPLATE_FORMATS = ('csv', 'xlsx')


def _get_config() -> Dict[str, Any]:
    """Return plugin config with defaults."""
    defaults = {'max_rows_per_import': 5000, 'max_file_size_mb': 10}
    plugin = Plugin.objects.filter(name='data_import').first()
    if plugin and plugin.config:
        return {**defaults, **plugin.config}
    return defaults


def _get_json_field(request, key: str, default: Any) -> Any:
    """Parse one JSON-encoded field from a multipart form or JSON body."""
    raw = request.data.get(key)
    if raw is None or raw == '':
        return default
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return default
    return raw


def _sanitize_options_for_storage(options: Dict[str, Any]) -> Dict[str, Any]:
    """Remove secrets before persisting options in ImportProfile/ImportBatch."""
    sanitized = dict(options)
    sanitized.pop('default_password', None)
    return sanitized


class ImporterAccessMixin:
    """Resolve an importer and apply its per-target authority.

    The plugin's ``manage`` grant only says the tool may be used; each importer
    re-applies the authority its own admin surface requires, so one grant does
    not unlock every target. Results are memoized per request: listing targets
    would otherwise re-run each importer's permission lookup, and importers
    sharing a plugin gate (all three skills targets) would query it repeatedly.
    """

    def _authority_cache(self) -> Dict[str, Optional[str]]:
        cache = getattr(self, '_authority_denials', None)
        if cache is None:
            cache = {}
            self._authority_denials = cache
        return cache

    def check_target_authority(self, importer) -> Optional[str]:
        """Return the denial reason for this importer, or None if allowed."""
        cache = self._authority_cache()
        if importer.target_key not in cache:
            cache[importer.target_key] = importer.check_authority(self.request.user)
        return cache[importer.target_key]

    def get_authorized_importer(self, target_key: str):
        if not target_key:
            raise ValueError('No target_key provided.')
        if not is_registered(target_key):
            raise ValueError(f'Unknown import target: {target_key}.')
        importer = get_importer(target_key)
        denial = self.check_target_authority(importer)
        if denial:
            raise PermissionDenied(detail=denial)
        return importer

    def can_access(self, importer) -> bool:
        return self.check_target_authority(importer) is None

    def accessible_target_keys(self) -> List[str]:
        """Target keys this caller may import."""
        return [i.target_key for i in list_importers() if self.can_access(i)]


class ImportTargetViewSet(ImporterAccessMixin, PluginPermissionMixin, viewsets.ViewSet):
    """List importable targets and download their sample templates."""
    plugin_name = 'data_import'
    permission_classes = [permissions.IsAuthenticated]
    permission_action_map = {'list': 'view', 'template': 'view'}

    def list(self, request):
        targets = [
            importer.to_dict()
            for importer in list_importers()
            if self.can_access(importer)
        ]
        return Response({'targets': targets}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='template')
    def template(self, request, pk=None):
        """Download a CSV/XLSX template generated from the importer's schema.

        The parameter is ``file_format``, not ``format``: DRF reserves
        ``format`` for renderer negotiation and 404s on an unknown value.
        """
        file_format = (request.query_params.get('file_format') or 'csv').lower()
        if file_format not in TEMPLATE_FORMATS:
            return Response(
                {'error': f"Unsupported format '{file_format}'. Use csv or xlsx."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not is_registered(pk):
            return Response(
                {'error': f'Unknown import target: {pk}.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        importer = self.get_authorized_importer(pk)
        return _template_response(importer, file_format)


class ImportProfileViewSet(ImporterAccessMixin, PluginPermissionMixin, viewsets.ModelViewSet):
    """CRUD for saved import mapping profiles.

    A profile is scoped to one target, so it carries that target's authority:
    the plugin grant alone must not expose or edit the mappings of a target
    the caller cannot import.
    """
    queryset = ImportProfile.objects.filter(is_active=True)
    serializer_class = ImportProfileSerializer
    # The frontend contract for this list is a bare array (ImportProfile[]),
    # not a paginated envelope — profiles are a small dropdown list.
    pagination_class = None
    plugin_name = 'data_import'
    permission_classes = [permissions.IsAuthenticated]
    permission_action_map = {'list': 'view'}

    def get_serializer_class(self):
        if self.action == 'list':
            return ImportProfileListSerializer
        return ImportProfileSerializer

    def get_queryset(self):
        queryset = super().get_queryset().filter(
            target_key__in=self.accessible_target_keys()
        )
        target_key = self.request.query_params.get('target_key')
        if target_key:
            queryset = queryset.filter(target_key=target_key)
        return queryset

    def perform_create(self, serializer):
        # Raises PermissionDenied when the caller may not import this target.
        self.get_authorized_importer(serializer.validated_data.get('target_key'))
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        self.get_authorized_importer(
            serializer.validated_data.get('target_key') or serializer.instance.target_key
        )
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        """Soft delete: set is_active=False instead of hard delete."""
        instance = self.get_object()
        instance.is_active = False
        instance.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DataImportViewSet(ImporterAccessMixin, PluginPermissionMixin, viewsets.GenericViewSet):
    """Analyze, preview, commit, and list import batches."""
    queryset = ImportBatch.objects.all()
    serializer_class = ImportBatchSerializer
    plugin_name = 'data_import'
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    permission_action_map = {
        'analyze': 'manage',
        'preview': 'manage',
        'commit': 'manage',
        'batches': 'view',
    }

    def _read_file(self, request) -> Tuple[pd.DataFrame, str]:
        """Enforce the upload limits, then parse the file.

        The size limit is checked against the upload's declared size *before*
        the bytes reach pandas, so an oversized file is never parsed.
        """
        file_obj = request.FILES.get('file')
        if not file_obj:
            raise ValueError('No file provided.')

        config = _get_config()
        max_size_mb = config.get('max_file_size_mb', 10)
        if file_obj.size and file_obj.size > max_size_mb * 1024 * 1024:
            raise ValueError(f'File exceeds maximum size of {max_size_mb} MB.')

        validate_upload(file_obj)

        df = read_tabular_file(file_obj.read(), filename=file_obj.name)

        max_rows = config.get('max_rows_per_import', 5000)
        if len(df) > max_rows:
            raise ValueError(f'File exceeds maximum rows of {max_rows}.')

        return df, file_obj.name

    def _get_request_payload(self, request) -> Tuple[Dict[str, str], Dict[str, Any], Dict[str, Any]]:
        return (
            _get_json_field(request, 'field_mapping', {}),
            _get_json_field(request, 'default_values', {}),
            _get_json_field(request, 'options', {}),
        )

    def _build_context(self, importer, rows, options, *, dry_run: bool) -> Dict[str, Any]:
        """Base run context plus whatever the importer's first pass produces."""
        context: Dict[str, Any] = {'actor': self.request.user}
        context.update(importer.prepare_batch(rows, options, dry_run=dry_run))
        return context

    def _run_preview(self, importer, df: pd.DataFrame, field_mapping: Dict[str, str],
                     default_values: Dict[str, Any], options: Dict[str, Any]) -> Dict[str, Any]:
        rows = _build_mapped_rows(
            df, field_mapping, default_values, importer,
            value_transforms=options.get('value_transforms'),
        )
        context = self._build_context(importer, rows, options, dry_run=True)

        results: List[Dict[str, Any]] = []
        summary = {'total': 0, 'valid': 0, 'warning': 0, 'error': 0, 'skipped': 0}

        for mapped_row in rows:
            row_result = importer.validate_row(
                mapped_row, options, existing=None, context=context
            )

            summary['total'] += 1
            if row_result.status == 'error':
                summary['error'] += 1
            elif row_result.status == 'skipped':
                summary['skipped'] += 1
            else:
                summary['valid'] += 1
                if row_result.warnings:
                    summary['warning'] += 1

            results.append({
                'row_index': row_result.row_index,
                'status': row_result.status,
                'errors': row_result.errors,
                'warnings': row_result.warnings,
                'preview': mapped_row,
            })

        importer.finalize_batch(context, options, dry_run=True)

        return {
            'summary': summary,
            'rows': results,
            'total_rows': len(rows),
            'payroll': context.get('payroll_result'),
        }

    @action(detail=False, methods=['post'])
    def analyze(self, request):
        """Step 1: detect columns and suggest a mapping."""
        try:
            importer = self.get_authorized_importer(request.data.get('target_key'))
            df, filename = self._read_file(request)

            columns = list(df.columns)
            suggested = suggest_mapping(columns, importer.get_mapping_aliases())
            profiles = ImportProfileListSerializer(
                ImportProfile.objects.filter(
                    target_key=importer.target_key, is_active=True
                ).order_by('name'),
                many=True,
            ).data

            return Response({
                'target_key': importer.target_key,
                'filename': filename,
                'detected_columns': columns,
                'detected_values': _detected_values(df),
                'suggested_mapping': suggested,
                'profiles': profiles,
                'total_rows': len(df),
            }, status=status.HTTP_200_OK)

        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except PermissionDenied:
            raise
        except Exception as e:  # noqa: BLE001
            return Response({'error': f'Failed to analyze file: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def preview(self, request):
        """Step 2: validate all rows without writing to the database."""
        try:
            importer = self.get_authorized_importer(request.data.get('target_key'))
            df, _ = self._read_file(request)
            field_mapping, default_values, options = self._get_request_payload(request)

            if not field_mapping:
                field_mapping = suggest_mapping(
                    list(df.columns), importer.get_mapping_aliases()
                )

            preview = self._run_preview(importer, df, field_mapping, default_values, options)
            return Response(preview, status=status.HTTP_200_OK)

        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except PermissionDenied:
            raise
        except Exception as e:  # noqa: BLE001
            return Response({'error': f'Failed to preview import: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def commit(self, request):
        """Step 3: commit the import."""
        try:
            importer = self.get_authorized_importer(request.data.get('target_key'))
            target_key = importer.target_key
            df, filename = self._read_file(request)
            field_mapping, default_values, options = self._get_request_payload(request)
            save_profile = request.data.get('save_profile')
            profile_name = request.data.get('profile_name')

            rows = _build_mapped_rows(
                df, field_mapping, default_values, importer,
                value_transforms=options.get('value_transforms'),
            )

            summary = {'total': 0, 'created': 0, 'updated': 0, 'skipped': 0, 'error': 0}
            row_errors: List[Dict[str, Any]] = []
            credentials: List[Dict[str, Any]] = []

            # Per-row savepoints: outer atomic + inner atomic for each row.
            with transaction.atomic():
                context = self._build_context(importer, rows, options, dry_run=False)

                for mapped_row in rows:
                    try:
                        with transaction.atomic():
                            row_result = importer.commit_row(
                                mapped_row, options, existing=None, context=context
                            )
                    except Exception as e:  # noqa: BLE001
                        row_result = ImportRowResult(
                            row_index=mapped_row.get('__row_index', 0),
                            status='error',
                            errors=[f'Unexpected error: {str(e)}'],
                        )

                    summary['total'] += 1

                    if row_result.status == 'created':
                        summary['created'] += 1
                    elif row_result.status == 'updated':
                        summary['updated'] += 1
                    elif row_result.status == 'skipped':
                        summary['skipped'] += 1
                    else:
                        summary['error'] += 1
                        row_errors.append({
                            'row_index': row_result.row_index,
                            'errors': row_result.errors,
                        })

                    # Capture one-time credentials for newly created users
                    if target_key == 'users' and row_result.status == 'created':
                        password = row_result.extra.get('password')
                        if password:
                            credentials.append({
                                'username': mapped_row.get('username', ''),
                                'email': mapped_row.get('email', ''),
                                'password': password,
                                'generated': row_result.extra.get('password_generated', False),
                            })

                importer.finalize_batch(context, options, dry_run=False)

            # The audit record is written after the data transaction commits so
            # a late failure cannot erase the history of what already ran. It
            # must never turn a committed import into a 400: the rows are
            # already in the database, so a failure here is logged and the
            # caller still gets the true outcome.
            self._record_batch(
                request, target_key, filename, summary, row_errors,
                field_mapping, default_values, options, save_profile, profile_name,
            )

            return Response({
                'summary': summary,
                'row_errors': row_errors,
                'credentials': credentials,
                'payroll': context.get('payroll_result'),
            }, status=status.HTTP_200_OK)

        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except PermissionDenied:
            raise
        except Exception as e:  # noqa: BLE001
            return Response({'error': f'Failed to commit import: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

    def _record_batch(self, request, target_key, filename, summary, row_errors,
                      field_mapping, default_values, options,
                      save_profile, profile_name) -> None:
        """Persist the audit trail for a committed run.

        Never raises: the import has already been committed, so a bookkeeping
        failure must not be reported to the caller as a failed import.
        """
        try:
            profile_id = self._save_profile(
                save_profile, profile_name, target_key, field_mapping, default_values, options
            )
            ImportBatch.objects.create(
                target_key=target_key,
                profile_id=profile_id,
                uploaded_by=request.user,
                original_filename=filename,
                field_mapping_used=field_mapping,
                options_used=_sanitize_options_for_storage(options),
                total_rows=summary['total'],
                created_count=summary['created'],
                updated_count=summary['updated'],
                skipped_count=summary['skipped'],
                error_count=summary['error'],
                row_errors=row_errors,
            )
        except Exception:  # noqa: BLE001
            logger.exception(
                "Import of %s from %s committed but its ImportBatch record failed",
                target_key, filename,
            )
        self._log_batch(request.user, target_key, filename, summary)

    def _save_profile(self, save_profile, profile_name, target_key,
                      field_mapping, default_values, options) -> Optional[int]:
        """Create or refresh the named mapping profile, without secrets."""
        if not (save_profile and profile_name and self.request.user):
            return None
        profile, created = ImportProfile.objects.update_or_create(
            name=profile_name,
            target_key=target_key,
            defaults={
                'field_mapping': field_mapping,
                'default_values': default_values,
                'options': _sanitize_options_for_storage(options),
                'is_active': True,
            },
        )
        if created:
            profile.created_by = self.request.user
            profile.save(update_fields=['created_by'])
        return profile.id

    def _log_batch(self, user, target_key, filename, summary) -> None:
        """Record one audit entry per batch (never one per row)."""
        try:
            from plugins.audit_log.signals import log_action

            log_action(
                user,
                'data_import',
                description=(
                    f"Imported {target_key} from {filename}: "
                    f"{summary['created']} created, {summary['updated']} updated, "
                    f"{summary['skipped']} skipped, {summary['error']} errors."
                ),
                new_values=summary,
            )
        except Exception:  # noqa: BLE001
            logger.exception("Failed to write the data import audit entry")

    @action(detail=False, methods=['get'])
    def batches(self, request):
        """List import history, optionally filtered by target_key.

        Scoped to targets the caller may import: ``row_errors`` quotes values
        from the failed rows (usernames, emails, team codes), so history for a
        target they cannot access must not be readable.
        """
        queryset = self.get_queryset().filter(
            target_key__in=self.accessible_target_keys()
        )
        target_key = request.query_params.get('target_key')
        if target_key:
            queryset = queryset.filter(target_key=target_key)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
