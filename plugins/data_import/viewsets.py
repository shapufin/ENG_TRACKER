"""
ViewSets for the Universal Data Import plugin.

Endpoints:
- /targets/           -> list importable targets with field schemas
- /profiles/        -> CRUD for saved ImportProfile mappings
- /import/analyze/  -> detect columns, suggest mapping
- /import/preview/  -> validate all rows without writing
- /import/commit/   -> commit the import
- /import/batches/  -> audit history
"""

from typing import Any, Dict, List

import pandas as pd
from django.db import transaction
from rest_framework import status, viewsets, permissions
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response

from core.mixins.permissions import PluginPermissionMixin
from core.utils.tabular_file import (
    read_tabular_file,
    resolve_mapping,
    suggest_mapping,
)
from apps.plugins.models import Plugin

from .models import ImportBatch, ImportProfile
from .serializers import ImportBatchSerializer, ImportProfileListSerializer, ImportProfileSerializer
from .importers.registry import get_importer, is_registered, list_importers
from .importers.base import ImportRowResult


def _get_config() -> Dict[str, Any]:
    """Return plugin config with defaults."""
    defaults = {'max_rows_per_import': 5000, 'max_file_size_mb': 10}
    plugin = Plugin.objects.filter(name='data_import').first()
    if plugin and plugin.config:
        return {**defaults, **plugin.config}
    return defaults


def _get_options(request) -> Dict[str, Any]:
    """Parse options from the request (multipart form or JSON)."""
    options_raw = request.data.get('options', '{}')
    if isinstance(options_raw, str):
        import json
        try:
            options = json.loads(options_raw)
        except json.JSONDecodeError:
            options = {}
    else:
        options = options_raw or {}
    return options


def _get_field_mapping(request) -> Dict[str, str]:
    """Parse field mapping from the request."""
    mapping_raw = request.data.get('field_mapping', '{}')
    if isinstance(mapping_raw, str):
        import json
        try:
            mapping = json.loads(mapping_raw)
        except json.JSONDecodeError:
            mapping = {}
    else:
        mapping = mapping_raw or {}
    return mapping


def _get_default_values(request) -> Dict[str, Any]:
    """Parse default values from the request."""
    values_raw = request.data.get('default_values', '{}')
    if isinstance(values_raw, str):
        import json
        try:
            values = json.loads(values_raw)
        except json.JSONDecodeError:
            values = {}
    else:
        values = values_raw or {}
    return values


def _sanitize_options_for_storage(options: Dict[str, Any]) -> Dict[str, Any]:
    """Remove secrets before persisting options in ImportBatch."""
    sanitized = dict(options)
    sanitized.pop('default_password', None)
    return sanitized


def _detected_values(df: pd.DataFrame, max_unique: int = 50) -> Dict[str, List[Any]]:
    """Return up to max_unique unique non-null values per column for transform UIs."""
    values: Dict[str, List[Any]] = {}
    for col in df.columns:
        unique_vals = df[col].dropna().astype(str).unique().tolist()[:max_unique]
        values[col] = [v for v in unique_vals if v]
    return values


def _parse_value(value: Any, field_type: str) -> Any:
    """Convert a pandas/cell value into a Python value appropriate for the field type."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None

    if field_type == 'bool':
        if isinstance(value, bool):
            return value
        lowered = str(value).lower().strip()
        if lowered in ('true', '1', 'yes', 'y'):
            return True
        if lowered in ('false', '0', 'no', 'n', ''):
            return False
        return None

    if field_type == 'integer':
        try:
            return int(float(value))
        except (ValueError, TypeError):
            return None

    if field_type == 'decimal':
        from decimal import Decimal, InvalidOperation
        try:
            return Decimal(str(value))
        except (InvalidOperation, ValueError, TypeError):
            return None

    if field_type == 'date':
        from datetime import date, datetime
        from dateutil import parser as date_parser
        if isinstance(value, date) and not isinstance(value, datetime):
            return value
        if isinstance(value, datetime):
            return value.date()
        try:
            parsed = date_parser.parse(str(value))
            return parsed.date()
        except (ValueError, TypeError, OverflowError):
            return None

    if field_type == 'choice':
        return str(value).strip() if pd.notna(value) else None

    # string / email / password
    if pd.isna(value):
        return None
    return str(value).strip() if value is not None else None


def _build_mapped_rows(
    df: pd.DataFrame,
    field_mapping: Dict[str, str],
    default_values: Dict[str, Any],
    importer,
    value_transforms: Dict[str, Dict[str, str]] | None = None,
) -> List[Dict[str, Any]]:
    """Build a list of mapped row dicts from a DataFrame and a field mapping."""
    df_columns = list(df.columns)
    resolved_mapping = resolve_mapping(field_mapping, df_columns)
    fields_by_key = {f.key: f for f in importer.get_fields()}
    transforms = value_transforms or {}

    rows = []
    for idx, row in df.iterrows():
        mapped_row: Dict[str, Any] = {'__row_index': int(idx) + 1}

        for our_field, their_column in resolved_mapping.items():
            field = fields_by_key.get(our_field)
            if field is None:
                continue
            val = row.get(their_column)
            parsed = _parse_value(val, field.field_type)
            field_transforms = transforms.get(our_field)
            if field_transforms is not None and field.field_type == 'choice' and parsed is not None:
                parsed = field_transforms.get(str(parsed).strip(), str(parsed).strip())
            mapped_row[our_field] = parsed

        # Apply default values for any field not present in the mapping
        for our_field, default_value in default_values.items():
            if our_field not in mapped_row:
                field = fields_by_key.get(our_field)
                parsed = _parse_value(default_value, field.field_type if field else 'string')
                field_transforms = transforms.get(our_field)
                if field_transforms is not None and field and field.field_type == 'choice' and parsed is not None:
                    parsed = field_transforms.get(str(parsed).strip(), str(parsed).strip())
                mapped_row[our_field] = parsed

        rows.append(mapped_row)

    return rows


class ImportTargetViewSet(PluginPermissionMixin, viewsets.ViewSet):
    """List all importable targets with their field schemas."""
    plugin_name = 'data_import'
    permission_classes = [permissions.IsAuthenticated]
    permission_action_map = {'list': 'view'}

    def list(self, request):
        targets = [importer.to_dict() for importer in list_importers()]
        return Response({'targets': targets}, status=status.HTTP_200_OK)


class ImportProfileViewSet(PluginPermissionMixin, viewsets.ModelViewSet):
    """CRUD for saved import mapping profiles."""
    queryset = ImportProfile.objects.all()
    serializer_class = ImportProfileSerializer
    plugin_name = 'data_import'
    permission_classes = [permissions.IsAuthenticated]
    permission_action_map = {'list': 'view'}

    def get_serializer_class(self):
        if self.action == 'list':
            return ImportProfileListSerializer
        return ImportProfileSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        target_key = self.request.query_params.get('target_key')
        if target_key:
            queryset = queryset.filter(target_key=target_key)
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def destroy(self, request, *args, **kwargs):
        """Soft delete: set is_active=False instead of hard delete."""
        instance = self.get_object()
        instance.is_active = False
        instance.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DataImportViewSet(PluginPermissionMixin, viewsets.GenericViewSet):
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

    def _read_file(self, request) -> tuple[pd.DataFrame, str]:
        file_obj = request.FILES.get('file')
        if not file_obj:
            raise ValueError('No file provided.')
        file_bytes = file_obj.read()
        df = read_tabular_file(file_bytes, filename=file_obj.name)
        return df, file_obj.name

    def _get_target_key(self, request) -> str:
        target_key = request.data.get('target_key')
        if not target_key:
            raise ValueError('No target_key provided.')
        if not is_registered(target_key):
            raise ValueError(f'Unknown import target: {target_key}.')
        return target_key

    def _run_preview(self, target_key: str, df: pd.DataFrame, field_mapping: Dict[str, str],
                     default_values: Dict[str, Any], options: Dict[str, Any]) -> Dict[str, Any]:
        importer = get_importer(target_key)
        rows = _build_mapped_rows(
            df, field_mapping, default_values, importer,
            value_transforms=options.get('value_transforms'),
        )

        results: List[Dict[str, Any]] = []
        summary = {'total': 0, 'valid': 0, 'warning': 0, 'error': 0, 'skipped': 0}

        for mapped_row in rows:
            row_result = importer.validate_row(mapped_row, options, existing=None)

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

        return {
            'summary': summary,
            'rows': results,
            'total_rows': len(rows),
        }

    @action(detail=False, methods=['post'])
    def analyze(self, request):
        """Step 1: detect columns and suggest a mapping."""
        try:
            target_key = self._get_target_key(request)
            df, filename = self._read_file(request)
            importer = get_importer(target_key)

            columns = list(df.columns)
            suggested = suggest_mapping(columns, importer.get_alias_suggestions())
            profiles = ImportProfileListSerializer(
                ImportProfile.objects.filter(target_key=target_key, is_active=True).order_by('name'),
                many=True,
            ).data

            # Check file size and row count limits
            
            config = _get_config()
            max_rows = config.get('max_rows_per_import', 5000)
            max_size_mb = config.get('max_file_size_mb', 10)
            file_obj = request.FILES.get('file')
            if file_obj and file_obj.size and file_obj.size > max_size_mb * 1024 * 1024:
                raise ValueError(f'File exceeds maximum size of {max_size_mb} MB.')
            if len(df) > max_rows:
                raise ValueError(f'File exceeds maximum rows of {max_rows}.')

            return Response({
                'target_key': target_key,
                'filename': filename,
                'detected_columns': columns,
                'detected_values': _detected_values(df),
                'suggested_mapping': suggested,
                'profiles': profiles,
                'total_rows': len(df),
            }, status=status.HTTP_200_OK)

        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:  # noqa: BLE001
            return Response({'error': f'Failed to analyze file: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def preview(self, request):
        """Step 2: validate all rows without writing to the database."""
        try:
            target_key = self._get_target_key(request)
            df, _ = self._read_file(request)
            field_mapping = _get_field_mapping(request)
            default_values = _get_default_values(request)
            options = _get_options(request)

            preview = self._run_preview(target_key, df, field_mapping, default_values, options)
            return Response(preview, status=status.HTTP_200_OK)

        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:  # noqa: BLE001
            return Response({'error': f'Failed to preview import: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def commit(self, request):
        """Step 3: commit the import."""
        try:
            target_key = self._get_target_key(request)
            df, filename = self._read_file(request)
            field_mapping = _get_field_mapping(request)
            default_values = _get_default_values(request)
            options = _get_options(request)
            save_profile = request.data.get('save_profile')
            profile_name = request.data.get('profile_name')

            importer = get_importer(target_key)
            rows = _build_mapped_rows(
                df, field_mapping, default_values, importer,
                value_transforms=options.get('value_transforms'),
            )

            results: List[ImportRowResult] = []
            summary = {'total': 0, 'created': 0, 'updated': 0, 'skipped': 0, 'error': 0}
            row_errors: List[Dict[str, Any]] = []
            credentials: List[Dict[str, Any]] = []

            # Per-row savepoints: outer atomic + inner atomic for each row.
            with transaction.atomic():
                for mapped_row in rows:
                    try:
                        with transaction.atomic():
                            row_result = importer.commit_row(mapped_row, options, existing=None)
                    except Exception as e:  # noqa: BLE001
                        row_result = ImportRowResult(
                            row_index=mapped_row.get('__row_index', 0),
                            status='error',
                            errors=[f'Unexpected error: {str(e)}'],
                        )

                    results.append(row_result)
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

                # Persist the audit record (without secrets)
                profile_id = None
                if save_profile and profile_name and request.user:
                    profile, created = ImportProfile.objects.update_or_create(
                        name=profile_name,
                        target_key=target_key,
                        defaults={
                            'field_mapping': field_mapping,
                            'default_values': default_values,
                            'options': _sanitize_options_for_storage(options),
                            'is_active': True,
                        }
                    )
                    if created:
                        profile.created_by = request.user
                        profile.save(update_fields=['created_by'])
                    profile_id = profile.id

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

            response_data = {
                'summary': summary,
                'row_errors': row_errors,
                'credentials': credentials,
            }
            return Response(response_data, status=status.HTTP_200_OK)

        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:  # noqa: BLE001
            return Response({'error': f'Failed to commit import: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def batches(self, request):
        """List import history, optionally filtered by target_key."""
        queryset = self.get_queryset()
        target_key = request.query_params.get('target_key')
        if target_key:
            queryset = queryset.filter(target_key=target_key)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)