"""Status, signed link and download for onboarding ZIP exports (plan A4).

``download`` is the one unauthenticated endpoint: a browser navigation cannot carry
the JWT, so a 120-second, single-use signed token (minted by ``download-link``)
is the credential. nginx then serves the file from the export volume.
"""
import logging

from django.conf import settings
from django.contrib.auth.models import User
from django.db.models import Q
from django.urls import reverse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from core.mixins.permissions import PluginPermissionMixin
from core.utils import get_client_ip
from core.utils.timezone_local import business_today
from core.utils.protected_download import (
    DownloadTokenError,
    make_download_token,
    new_nonce,
    protected_file_response,
    read_download_token,
)

try:
    from plugins.audit_log.signals import log_action
except ImportError:  # the audit_log plugin is optional
    log_action = None

from .models import ClientExport
from .serializers import ClientExportSerializer
from .services import exporter
from .viewsets import _assigned_client_ids

logger = logging.getLogger(__name__)

TOKEN_KIND = 'onboarding-export'
ACCEL_PREFIX = '/_protected/exports'


class ClientExportViewSet(PluginPermissionMixin, viewsets.GenericViewSet):
    plugin_name = 'onboarding'
    serializer_class = ClientExportSerializer
    permission_action_map = {'retrieve': 'export', 'all': 'export', 'download_link': 'export'}
    # Unthrottled by default (the status poll must not eat the 20/hour export budget);
    # the actions that create work set throttle_scope='export' themselves.
    throttle_scope = None

    def get_authenticators(self):
        # Same technique as DocumentViewSet's office actions: `self.action` is not set
        # yet, but the action map and the raw request are.
        request = getattr(self, 'request', None)
        action_map = getattr(self, 'action_map', None) or {}
        if request is not None and action_map.get(request.method.lower()) == 'download':
            return []
        return super().get_authenticators()

    def check_permissions(self, request):
        if self.action == 'download':
            # The signed token is the credential; only the plugin switch still applies.
            if self._plugin_is_disabled(self.plugin_name):
                raise PermissionDenied('The onboarding plugin is disabled.')
            return
        super().check_permissions(request)

    def get_queryset(self):
        qs = ClientExport.objects.all()
        if self.request.user.is_superuser:
            return qs
        return qs.filter(requested_by=self.request.user)

    def retrieve(self, request, pk=None):
        return Response(self.get_serializer(self.get_object()).data)

    @action(detail=False, methods=['post'], throttle_scope='export')
    def all(self, request):
        """Every client, archived ones included. Superuser only."""
        if not request.user.is_superuser:
            raise PermissionDenied('Only superusers can export all clients.')
        export = exporter.request_export(request.user, ClientExport.KIND_ALL)
        return Response(self.get_serializer(export).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='download-link', url_name='download-link',
            throttle_scope='export')
    def download_link(self, request, pk=None):
        """A 120-second, single-use URL the browser can navigate to."""
        export = self.get_object()
        self._require_current_access(request.user, export)
        expired = export.expires_at is not None and export.expires_at < timezone.now()
        if export.status != 'ready' or expired:
            return Response({'detail': 'This export is not ready to download.'}, status=status.HTTP_409_CONFLICT)
        nonce = new_nonce()  # replaces any earlier unused link
        ClientExport.objects.filter(pk=export.pk).update(download_nonce=nonce)
        token = make_download_token(
            user_id=request.user.pk, kind=TOKEN_KIND, object_id=export.pk, nonce=nonce,
        )
        path = reverse('onboarding-export-download', kwargs={'pk': export.pk})
        return Response({'url': f'{path}?token={token}'})

    @staticmethod
    def _require_current_access(user, export):
        """An export outlives a user's access to the client by up to 24 hours, so the
        link is only minted for someone who could still request this export today."""
        if user.is_superuser:
            return
        client = export.client
        if export.kind != ClientExport.KIND_CLIENT or client is None or not client.is_active:
            raise PermissionDenied('You no longer have access to this export.')
        client_ids = _assigned_client_ids(user)
        if client_ids is not None and client.pk not in client_ids:
            raise PermissionDenied('You no longer have access to this export.')

    @action(detail=True, methods=['get'], permission_classes=[AllowAny])
    def download(self, request, pk=None):
        try:
            payload = read_download_token(request.query_params.get('token', ''))
        except DownloadTokenError:
            return Response(status=status.HTTP_403_FORBIDDEN)
        if payload['kind'] != TOKEN_KIND or str(payload['object_id']) != str(pk):
            return Response(status=status.HTTP_403_FORBIDDEN)
        export = ClientExport.objects.filter(pk=pk, status='ready').filter(
            Q(expires_at__isnull=True) | Q(expires_at__gte=timezone.now())
        ).first()
        if export is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        user = User.objects.filter(pk=payload['user_id'], is_active=True).first()
        # Single use: only the request that clears the nonce gets the file.
        consumed = (
            ClientExport.objects.filter(pk=export.pk, download_nonce=payload['nonce'])
            .exclude(download_nonce='')
            .update(download_nonce='')
        )
        if user is None or not consumed:
            return Response(status=status.HTTP_403_FORBIDDEN)
        self._audit(request, user, export)
        label = export.client_code or 'all-clients'
        return protected_file_response(
            settings.EXPORT_ROOT, export.relative_path,
            filename=f'onboarding-{label}-{business_today().isoformat()}.zip',
            accel_prefix=ACCEL_PREFIX, content_type='application/zip',
        )

    @staticmethod
    def _audit(request, user, export):
        if log_action is None:
            return
        log_action(
            user=user,
            action='export',
            description=f'Downloaded onboarding export #{export.pk} ({export.client_code or "all clients"})',
            obj=export,
            new_values={'documents': export.documents, 'bytes': export.bytes, 'sha256': export.sha256},
            ip_address=get_client_ip(request) or None,
            user_agent=request.META.get('HTTP_USER_AGENT', '')[:500],
        )
