"""Previous-years API: list snapshots, list their files, download one (plan Y4).

Read-only and superuser-only: a closed year is evidence, and there is nothing to
write here. Downloads follow the same signed-single-use-link pattern as the
onboarding exports, so a multi-GB set never streams through gunicorn.
"""
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from django.urls import reverse
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from core.mixins.permissions import PluginPermissionMixin
from core.utils.protected_download import (
    DownloadTokenError,
    make_download_token,
    new_nonce,
    protected_file_response,
    read_download_token,
)

from .models import YearSnapshot, YearSnapshotFile
from .serializers import YearSnapshotFileSerializer, YearSnapshotSerializer

TOKEN_KIND = 'year-snapshot-file'
ACCEL_PREFIX = '/_protected/snapshots/'


class SuperuserOnlyMixin(PluginPermissionMixin):
    """Only ``is_superuser`` passes — staff does not, and neither does a grant.

    Same reasoning as the site-backup plugin: a closed year is company-wide
    evidence with no scoping story, so the surface stays superuser-only even
    while the plugin is enabled.
    """

    def check_permissions(self, request):
        super().check_permissions(request)
        if not (request.user and request.user.is_authenticated and request.user.is_superuser):
            raise PermissionDenied('Only superusers can read closed years.')


class YearSnapshotViewSet(SuperuserOnlyMixin, mixins.ListModelMixin,
                           mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Read-only list of year snapshots."""

    plugin_name = 'year_close'
    serializer_class = YearSnapshotSerializer
    permission_action_map = {'files': 'view'}
    queryset = YearSnapshot.objects.all().order_by('-year', '-version')

    @action(detail=True, methods=['get'])
    def files(self, request, pk=None):
        snapshot = self.get_object()
        rows = snapshot.files.all().order_by('kind', 'leader_name', 'team_name')
        return Response(YearSnapshotFileSerializer(rows, many=True).data)


class YearSnapshotFileViewSet(SuperuserOnlyMixin, mixins.RetrieveModelMixin,
                              viewsets.GenericViewSet):
    """One file: mint a signed link, then serve it from the read-only volume."""

    plugin_name = 'year_close'
    serializer_class = YearSnapshotFileSerializer
    queryset = YearSnapshotFile.objects.select_related('snapshot')
    permission_action_map = {'download_link': 'export'}

    def get_authenticators(self):
        # The signed token is the credential for the download itself.
        if getattr(self, 'action', None) == 'download':
            return []
        return super().get_authenticators()

    def check_permissions(self, request):
        if getattr(self, 'action', None) == 'download':
            if self._plugin_is_disabled(self.plugin_name):
                raise PermissionDenied('The year close plugin is disabled.')
            return
        super().check_permissions(request)

    @action(detail=True, methods=['post'], url_path='download-link', url_name='download-link')
    def download_link(self, request, pk=None):
        """A 120-second, single-use URL the browser can navigate to."""
        row = self.get_object()
        if row.status != 'ready':
            return Response(
                {'detail': 'This file is not ready to download.'},
                status=status.HTTP_409_CONFLICT,
            )
        nonce = new_nonce()  # replaces any earlier unused link
        YearSnapshotFile.objects.filter(pk=row.pk).update(download_nonce=nonce)
        token = make_download_token(
            user_id=request.user.pk, kind=TOKEN_KIND, object_id=row.pk, nonce=nonce,
        )
        path = reverse('year_close-file-download', kwargs={'pk': row.pk})
        return Response({'url': f'{path}?token={token}'})

    @action(detail=True, methods=['get'], permission_classes=[AllowAny])
    def download(self, request, pk=None):
        try:
            payload = read_download_token(request.query_params.get('token', ''))
        except DownloadTokenError:
            return Response(status=status.HTTP_403_FORBIDDEN)
        if payload['kind'] != TOKEN_KIND or str(payload['object_id']) != str(pk):
            return Response(status=status.HTTP_403_FORBIDDEN)

        row = YearSnapshotFile.objects.filter(pk=pk, status='ready').select_related(
            'snapshot'
        ).first()
        if row is None:
            return Response(status=status.HTTP_404_NOT_FOUND)

        # The token binds the user, so someone who lost access since the link was
        # minted must be refused BEFORE the nonce is consumed — otherwise a
        # refused request would burn the single-use link.
        user = get_user_model().objects.filter(pk=payload['user_id'], is_active=True).first()
        if user is None:
            return Response(status=status.HTTP_403_FORBIDDEN)

        # Single use: only the request that clears the nonce gets the file.
        consumed = (
            YearSnapshotFile.objects.filter(pk=row.pk, download_nonce=payload['nonce'])
            .exclude(download_nonce='')
            .update(download_nonce='')
        )
        if not consumed:
            return Response(status=status.HTTP_403_FORBIDDEN)

        self._audit(payload['user_id'], row)
        filename = row.relative_path.rsplit('/', 1)[-1]
        return protected_file_response(
            settings.SNAPSHOT_ROOT, row.relative_path,
            filename=f'{row.snapshot.year}-{filename}',
            accel_prefix=ACCEL_PREFIX, content_type='application/zip',
        )

    @staticmethod
    def _audit(user_id, row):
        """Every download is audited; the manifest stays the durable record."""
        try:
            from apps.reports.models import AuditLog
        except Exception:  # noqa: BLE001
            return
        AuditLog.objects.create(
            user_id=user_id,
            action='UPDATE',
            model_name='closedyear',
            object_id=str(row.snapshot.year),
            object_repr=f'Snapshot file {row.relative_path}',
            extra_data={'operation': 'year_snapshot_download', 'file_id': row.pk},
        )
