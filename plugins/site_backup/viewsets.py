import logging
from contextlib import contextmanager

from django.http import FileResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.plugins.models import Plugin

from .models import BackupRecord
from .serializers import (
    BackupRecordSerializer,
    CreateBackupSerializer,
    RestoreCommitSerializer,
    RestorePreviewSerializer,
)
from .services import backup as backup_service
from .services import restore as restore_service
from .services.archive import ArchiveError

logger = logging.getLogger(__name__)


class SuperuserOnlyMixin:
    """Hard superuser gate for the whole plugin.

    A full-site restore can overwrite or delete any row in the database, so
    this is intentionally stricter than the platform's usual
    staff-or-plugin-manage-grant pattern: only ``is_superuser`` passes,
    regardless of ``is_staff`` or any ``PluginPermission.is_public``/role
    grant on ``site_backup``.
    """

    def check_permissions(self, request):
        super().check_permissions(request)
        if not (request.user and request.user.is_authenticated and request.user.is_superuser):
            raise PermissionDenied('Only superusers can access site backup & restore.')


def _max_upload_size_bytes() -> int:
    defaults = {'max_upload_size_mb': 500}
    plugin = Plugin.objects.filter(name='site_backup').first()
    config = {**defaults, **(plugin.config if plugin and plugin.config else {})}
    return config.get('max_upload_size_mb', 500) * 1024 * 1024


@contextmanager
def _resolve_archive_file(data):
    """Yield an open, seekable file object for the uploaded file or a stored backup.

    Enforces the upload size cap before anything is parsed. A stored backup's
    file handle is always closed on exit — left open, Windows can't delete or
    reopen the underlying file until the process exits.
    """
    uploaded = data.get('file')
    if uploaded is not None:
        if uploaded.size and uploaded.size > _max_upload_size_bytes():
            raise ValidationError(
                f'Archive exceeds the maximum upload size of '
                f'{_max_upload_size_bytes() // (1024 * 1024)} MB.'
            )
        yield uploaded
        return

    backup_id = data.get('backup_id')
    record = BackupRecord.objects.filter(pk=backup_id).first()
    if record is None:
        raise ValidationError({'backup_id': 'No backup found with that id.'})
    with record.file.open('rb') as fh:
        yield fh


class BackupRecordViewSet(SuperuserOnlyMixin, viewsets.ModelViewSet):
    queryset = BackupRecord.objects.select_related('created_by')
    serializer_class = BackupRecordSerializer
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def create(self, request, *args, **kwargs):
        input_serializer = CreateBackupSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        record = backup_service.create_backup(
            user=request.user,
            note=input_serializer.validated_data['note'],
            include_media=input_serializer.validated_data['include_media'],
        )
        return Response(BackupRecordSerializer(record).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        record = self.get_object()
        response = FileResponse(record.file.open('rb'), as_attachment=True, filename=record.filename)
        return response

    def destroy(self, request, *args, **kwargs):
        record = self.get_object()
        record.file.delete(save=False)
        record.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RestoreViewSet(SuperuserOnlyMixin, viewsets.ViewSet):

    @action(detail=False, methods=['post'])
    def preview(self, request):
        serializer = RestorePreviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with _resolve_archive_file(serializer.validated_data) as file_obj:
                result = restore_service.preview(file_obj)
        except ArchiveError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)

    @action(detail=False, methods=['post'])
    def commit(self, request):
        serializer = RestoreCommitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            with _resolve_archive_file(data) as file_obj:
                result = restore_service.commit(
                    file_obj,
                    approved_models=data['approved_models'],
                    delete_missing_models=data.get('delete_missing_models', []),
                    restore_media=data.get('restore_media', False),
                    confirmed=data.get('confirmed', False),
                    user=request.user,
                )
        except (ArchiveError, restore_service.RestoreError) as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)
