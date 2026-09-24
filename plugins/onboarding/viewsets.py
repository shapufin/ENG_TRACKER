import logging
import os
import urllib.error
import urllib.request

import jwt
from django.conf import settings
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.base import ContentFile
from django.db import IntegrityError, transaction
from django.db.models import Count
from django.http import FileResponse, JsonResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.overtime.models.core import Client
from core.mixins.permissions import PluginPermissionMixin

from .models import MAX_FOLDER_DEPTH, SEARCH_RESULT_LIMIT, Document, Folder
from .office_integration import (
    build_editor_config,
    decode_callback_jwt,
    is_editable_office,
    office_editor_enabled,
    verify_office_file_token,
)
from .serializers import DocumentSerializer, FolderSerializer, OnboardingClientSerializer
from .upload_validation import DOCUMENT_POLICY, UploadValidationError, validate_upload

logger = logging.getLogger(__name__)

# Actions called by the OnlyOffice document server itself (office-file,
# office-callback), never by a logged-in browser session — the server has no
# Django session/token, so it can't pass the normal auth this viewset
# otherwise requires. Each one verifies its own signed token/JWT instead.
_OFFICE_SERVER_ACTIONS = {'office_file', 'office_callback'}


def _assigned_client_ids(user):
    """Clients the user may see. Staff/superuser see everything (support/debug)."""
    if user.is_staff or user.is_superuser:
        return None
    profile = getattr(user, 'profile', None)
    if profile is None:
        return []
    return list(profile.clients.values_list('id', flat=True))


class ClientScopedMixin:
    """Caches ``_assigned_client_ids`` per request (per viewset instance —
    DRF instantiates a fresh viewset per request) so a single action that
    calls both ``get_queryset()`` and ``check_client_access()`` (every
    update/move) doesn't run the ``profile.clients`` query twice."""

    _client_ids_cache_set = False
    _client_ids_cache = None

    def assigned_client_ids(self):
        if not self._client_ids_cache_set:
            self._client_ids_cache = _assigned_client_ids(self.request.user)
            self._client_ids_cache_set = True
        return self._client_ids_cache

    def check_client_access(self, client_id):
        client_ids = self.assigned_client_ids()
        if client_ids is not None and client_id not in client_ids:
            raise ValidationError({'client': 'You are not assigned to this client.'})


def _resolve_ancestor_chains(client_id, seed_ids):
    """id -> (name, parent_id) for exactly the folders needed to build
    ancestor paths for ``seed_ids`` (the matched rows' own/containing
    folder ids), walked one tree level at a time.

    Replaces a prior version that loaded every folder in the client on
    every search — bounded by MAX_FOLDER_DEPTH levels here instead, so
    cost tracks the (small, capped) match set, not the client's total
    folder count.
    """
    lookup = {}
    frontier = {fid for fid in seed_ids if fid is not None}
    depth = 0
    while frontier and depth < MAX_FOLDER_DEPTH:
        frontier -= lookup.keys()
        if not frontier:
            break
        rows = Folder.objects.filter(client_id=client_id, id__in=frontier).values(
            'id', 'name', 'parent_id'
        )
        next_frontier = set()
        for row in rows:
            lookup[row['id']] = (row['name'], row['parent_id'])
            if row['parent_id'] is not None:
                next_frontier.add(row['parent_id'])
        frontier = next_frontier
        depth += 1
    return lookup


def _ancestor_chain(folder_id, lookup):
    """(id, name) pairs from the client root down to (not including)
    ``folder_id``. Returns ids too (not just names) so the frontend can
    rebuild the full breadcrumb trail on click instead of jumping in with a
    single crumb.

    Uses ``lookup.get`` (not ``lookup[...]``) at every hop: a folder id that
    isn't in this client's lookup (e.g. a cross-client ``parent``/``folder``
    left over from before write-time validation was added) stops the walk
    instead of raising ``KeyError`` (500).
    """
    chain = []
    depth = 0
    _, parent_id = lookup.get(folder_id, (None, None))
    while parent_id is not None and depth < MAX_FOLDER_DEPTH:
        entry = lookup.get(parent_id)
        if entry is None:
            break
        name, next_parent_id = entry
        chain.append({'id': parent_id, 'name': name})
        parent_id = next_parent_id
        depth += 1
    return list(reversed(chain))


def _validate_same_client(record_client_id, related, field_name):
    """Raise if ``related`` (a Folder, for ``parent``/``folder`` fields)
    belongs to a different client than the record being written. Only
    ``move`` validated this before; a plain PATCH with a cross-client
    ``parent``/``folder`` id went straight through."""
    if related is not None and related.client_id != record_client_id:
        raise ValidationError({field_name: f'{field_name.capitalize()} belongs to a different client.'})


def _validation_message(exc):
    if isinstance(exc, DjangoValidationError):
        return exc.messages[0] if exc.messages else str(exc)
    return 'A name collision occurred here.'


class OnboardingClientViewSet(PluginPermissionMixin, viewsets.ViewSet):
    plugin_name = 'onboarding'

    def list(self, request):
        client_ids = _assigned_client_ids(request.user)
        qs = Client.objects.filter(is_active=True)
        if client_ids is not None:
            qs = qs.filter(id__in=client_ids)
        return Response(OnboardingClientSerializer(qs.order_by('name'), many=True).data)


class FolderViewSet(ClientScopedMixin, PluginPermissionMixin, viewsets.ModelViewSet):
    plugin_name = 'onboarding'
    serializer_class = FolderSerializer
    permission_action_map = {'move': 'manage'}

    def get_queryset(self):
        client_ids = self.assigned_client_ids()
        qs = Folder.objects.select_related('created_by', 'updated_by').annotate(
            child_count=Count('children', distinct=True),
            document_count=Count('documents', distinct=True),
        )
        if client_ids is not None:
            qs = qs.filter(client_id__in=client_ids)
        client_id = self.request.query_params.get('client_id')
        if client_id:
            qs = qs.filter(client_id=client_id)
        parent_id = self.request.query_params.get('parent_id')
        if parent_id:
            qs = qs.filter(parent_id=parent_id)
        elif 'parent_id' in self.request.query_params:
            qs = qs.filter(parent__isnull=True)
        return qs

    def perform_create(self, serializer):
        client_id = serializer.validated_data['client'].id
        self.check_client_access(client_id)
        _validate_same_client(client_id, serializer.validated_data.get('parent'), 'parent')
        try:
            with transaction.atomic():
                serializer.save(created_by=self.request.user)
        except (IntegrityError, DjangoValidationError) as exc:
            raise ValidationError({'name': _validation_message(exc)})

    def perform_update(self, serializer):
        client_id = serializer.instance.client_id
        self.check_client_access(client_id)
        if 'parent' in serializer.validated_data:
            _validate_same_client(client_id, serializer.validated_data['parent'], 'parent')
        try:
            with transaction.atomic():
                serializer.save(updated_by=self.request.user)
        except (IntegrityError, DjangoValidationError) as exc:
            raise ValidationError({'name': _validation_message(exc)})

    @action(detail=True, methods=['post'])
    def move(self, request, pk=None):
        folder = self.get_object()
        parent_id = request.data.get('parent_id')
        if parent_id is None:
            folder.parent = None
        else:
            try:
                target = Folder.objects.get(pk=parent_id)
            except Folder.DoesNotExist:
                raise ValidationError({'parent_id': 'Target folder does not exist.'})
            if target.client_id != folder.client_id:
                raise ValidationError({'parent_id': 'Cannot move a folder to a different client.'})
            self.check_client_access(target.client_id)
            folder.parent = target
        folder.updated_by = request.user
        try:
            with transaction.atomic():
                folder.save()
        except (IntegrityError, DjangoValidationError) as exc:
            raise ValidationError({'parent_id': _validation_message(exc)})
        return Response(FolderSerializer(folder).data)

    @action(detail=False, methods=['get'])
    def search(self, request):
        """Search folder/document names across the whole client tree
        (not scoped to the current directory, unlike list/)."""
        query = request.query_params.get('q', '').strip()
        client_id = request.query_params.get('client_id')
        if not query or not client_id:
            return Response({'folders': [], 'documents': []})
        try:
            client_id = int(client_id)
        except (TypeError, ValueError):
            raise ValidationError({'client_id': 'client_id must be an integer.'})
        self.check_client_access(client_id)

        folders = list(Folder.objects.filter(
            client_id=client_id, name__icontains=query
        ).only('id', 'name', 'parent_id')[:SEARCH_RESULT_LIMIT])
        documents = list(Document.objects.filter(
            client_id=client_id, name__icontains=query
        ).only('id', 'name', 'folder_id')[:SEARCH_RESULT_LIMIT])

        seed_ids = [f.id for f in folders] + [d.folder_id for d in documents if d.folder_id]
        lookup = _resolve_ancestor_chains(client_id, seed_ids)

        folder_results = []
        for f in folders:
            ancestors = _ancestor_chain(f.id, lookup)
            folder_results.append({
                'id': f.id, 'name': f.name, 'parent': f.parent_id,
                'path': ' / '.join(a['name'] for a in ancestors) or None,
                'ancestors': ancestors,
            })

        document_results = []
        for d in documents:
            containing_folder = lookup.get(d.folder_id) if d.folder_id else None
            ancestors = _ancestor_chain(d.folder_id, lookup) if d.folder_id else []
            if containing_folder is not None:
                ancestors = ancestors + [{'id': d.folder_id, 'name': containing_folder[0]}]
            document_results.append({
                'id': d.id, 'name': d.name, 'folder': d.folder_id,
                'path': ' / '.join(a['name'] for a in ancestors) or None,
                'ancestors': ancestors,
            })

        return Response({'folders': folder_results, 'documents': document_results})


class DocumentViewSet(ClientScopedMixin, PluginPermissionMixin, viewsets.ModelViewSet):
    plugin_name = 'onboarding'
    serializer_class = DocumentSerializer
    permission_action_map = {'move': 'manage', 'download': 'view', 'editor_config': 'view'}

    def get_authenticators(self):
        # office_file/office_callback are called by the document server, not
        # a user's browser session. Both reuse the `Authorization: Bearer`
        # header for the *OnlyOffice* JWT, which SimpleJWT's global
        # authentication class would otherwise try to parse as its own
        # token and reject with 401/403 before the view ever runs. Skip
        # authentication entirely for these two — each verifies its own
        # signed token/JWT inside the action body instead.
        #
        # Can't key off `self.action` here — DRF's ViewSetMixin.initialize_request()
        # calls get_authenticators() (via the base APIView.initialize_request())
        # BEFORE it sets self.action. `self.action_map` + `self.request` (the
        # raw, not-yet-wrapped request) are already set at this point, though.
        request = getattr(self, 'request', None)
        action_map = getattr(self, 'action_map', None) or {}
        action = action_map.get(request.method.lower()) if request is not None else None
        if action in _OFFICE_SERVER_ACTIONS:
            return []
        return super().get_authenticators()

    def check_permissions(self, request):
        if self.action in _OFFICE_SERVER_ACTIONS:
            return
        super().check_permissions(request)

    def get_queryset(self):
        client_ids = self.assigned_client_ids()
        qs = Document.objects.select_related('uploaded_by', 'updated_by')
        if client_ids is not None:
            qs = qs.filter(client_id__in=client_ids)
        client_id = self.request.query_params.get('client_id')
        if client_id:
            qs = qs.filter(client_id=client_id)
        folder_id = self.request.query_params.get('folder_id')
        if folder_id:
            qs = qs.filter(folder_id=folder_id)
        elif 'folder_id' in self.request.query_params:
            qs = qs.filter(folder__isnull=True)
        return qs

    def create(self, request, *args, **kwargs):
        file_obj = request.data.get('file')
        try:
            validate_upload(file_obj)
        except UploadValidationError as exc:
            return Response({'error': exc.detail, 'code': exc.code}, status=status.HTTP_400_BAD_REQUEST)
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        client = serializer.validated_data['client']
        self.check_client_access(client.id)
        _validate_same_client(client.id, serializer.validated_data.get('folder'), 'folder')
        file_obj = self.request.data.get('file')
        try:
            with transaction.atomic():
                serializer.save(
                    uploaded_by=self.request.user,
                    file=file_obj,
                    size_bytes=getattr(file_obj, 'size', 0),
                    name=serializer.validated_data.get('name') or getattr(file_obj, 'name', ''),
                )
        except (IntegrityError, DjangoValidationError) as exc:
            raise ValidationError({'name': _validation_message(exc)})

    def perform_update(self, serializer):
        client_id = serializer.instance.client_id
        self.check_client_access(client_id)
        if 'folder' in serializer.validated_data:
            _validate_same_client(client_id, serializer.validated_data['folder'], 'folder')
        try:
            with transaction.atomic():
                serializer.save(updated_by=self.request.user)
        except (IntegrityError, DjangoValidationError) as exc:
            raise ValidationError({'name': _validation_message(exc)})

    @action(detail=True, methods=['post'])
    def move(self, request, pk=None):
        document = self.get_object()
        folder_id = request.data.get('folder_id')
        if folder_id is None:
            document.folder = None
        else:
            try:
                target = Folder.objects.get(pk=folder_id)
            except Folder.DoesNotExist:
                raise ValidationError({'folder_id': 'Target folder does not exist.'})
            if target.client_id != document.client_id:
                raise ValidationError({'folder_id': 'Cannot move a document to a different client.'})
            self.check_client_access(target.client_id)
            document.folder = target
        document.updated_by = request.user
        try:
            with transaction.atomic():
                document.save()
        except (IntegrityError, DjangoValidationError) as exc:
            raise ValidationError({'folder_id': _validation_message(exc)})
        return Response(DocumentSerializer(document).data)

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        """Serve the document. html/svg always forced to attachment — those
        types can carry scripts and must never execute in the app's origin
        (same defense as ticket_kpi's evidence download)."""
        document = self.get_object()
        file_path = document.file.path
        ext = os.path.splitext(document.name)[1].lstrip('.').lower()

        # as_attachment=True + filename= lets FileResponse build a correctly
        # escaped Content-Disposition (RFC 6266 filename*/quoting) instead of
        # interpolating document.name (user-editable via rename) into the
        # header value directly, which breaks on an embedded `"`.
        response = FileResponse(open(file_path, 'rb'), as_attachment=True, filename=document.name)
        if ext in {'html', 'htm', 'svg'}:
            response['Content-Type'] = 'application/octet-stream'
        return response

    @action(detail=True, methods=['get'], url_path='editor-config', url_name='editor-config')
    def editor_config(self, request, pk=None):
        """Signed OnlyOffice config for the browser to open this document in
        the in-browser editor. 404s outright if the document server isn't
        configured or this isn't an editable office file — keeps the
        frontend's Edit button a pure presence check, no capability leak."""
        if not office_editor_enabled():
            return Response(status=status.HTTP_404_NOT_FOUND)
        document = self.get_object()
        if not is_editable_office(document.name):
            return Response(
                {'error': 'This file type cannot be opened in the office editor.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        can_edit = self._has_plugin_permission(request.user, 'onboarding', 'manage')
        config = build_editor_config(document, request.user, request, can_edit)
        return Response({
            'config': config,
            'document_server_url': settings.ONLYOFFICE_DOCUMENT_SERVER_URL,
        })

    @action(detail=True, methods=['get'], url_path='office-file', url_name='office-file')
    def office_file(self, request, pk=None):
        """Fetched by the OnlyOffice container itself (server-to-server), not
        the browser — authenticated by a short-lived signed token instead of
        a user session. Never forces attachment; the document server needs
        the raw bytes inline."""
        token = request.query_params.get('token', '')
        if not verify_office_file_token(token, pk):
            return Response(status=status.HTTP_403_FORBIDDEN)
        document = Document.objects.filter(pk=pk).first()
        if document is None or not is_editable_office(document.name):
            return Response(status=status.HTTP_404_NOT_FOUND)
        return FileResponse(open(document.file.path, 'rb'))

    @action(detail=True, methods=['post'], url_path='office-callback', url_name='office-callback')
    def office_callback(self, request, pk=None):
        """OnlyOffice's save callback. Must always return HTTP 200 with a
        JSON `{"error": ...}` body — the document server treats any other
        shape as a failure and retries. See:
        https://api.onlyoffice.com/editors/callback
        """
        # The decoded JWT *payload* — not request.data — drives everything
        # below. OnlyOffice signs the callback body itself, so the payload
        # is the only part of this request that's actually authenticated;
        # trusting the raw body let a forged/replayed request point
        # `download_url` anywhere (SSRF) and attribute the save to any
        # `users` id, even though the JWT check "passed".
        try:
            auth_header = request.headers.get('Authorization') or (
                f"Bearer {request.data.get('token')}" if request.data.get('token') else None
            )
            payload = decode_callback_jwt(auth_header)
        except jwt.InvalidTokenError:
            logger.warning('onboarding office_callback: JWT verification failed for document %s', pk)
            return JsonResponse({'error': 1})

        # Some document-server versions nest the signed body under a
        # `payload` key instead of signing it at the top level.
        payload = payload.get('payload', payload)

        callback_status = payload.get('status')
        if callback_status not in (2, 6):
            # 1=editing, 3=save error, 4=closed-no-changes, 7=force-save error
            # — nothing to persist, just acknowledge.
            return JsonResponse({'error': 0})

        document = Document.objects.filter(pk=pk).first()
        if document is None:
            return JsonResponse({'error': 1})

        download_url = payload.get('url')
        # Confines the server-to-server fetch to the configured document
        # server's own origin — without this, a valid JWT (signed with a
        # leaked/shared secret) could still be used to make this backend
        # fetch an arbitrary internal URL (SSRF into backend_net).
        if not download_url or not download_url.startswith(settings.ONLYOFFICE_DOCUMENT_SERVER_URL):
            logger.warning('onboarding office_callback: rejected off-origin url for document %s', pk)
            return JsonResponse({'error': 1})

        try:
            with urllib.request.urlopen(download_url, timeout=15) as resp:
                content = resp.read(DOCUMENT_POLICY['max_bytes'] + 1)
        except (urllib.error.URLError, TimeoutError):
            logger.warning('onboarding office_callback: failed to fetch saved file for document %s', pk)
            return JsonResponse({'error': 1})

        new_file = ContentFile(content, name=document.name)
        try:
            validate_upload(new_file)
        except UploadValidationError:
            logger.warning('onboarding office_callback: saved file failed validation for document %s', pk)
            return JsonResponse({'error': 1})

        acting_user_ids = payload.get('users') or []
        acting_user = User.objects.filter(pk=acting_user_ids[0]).first() if acting_user_ids else None

        # Delete the previous physical file only after the new one is
        # committed — every autosave otherwise leaves the prior revision
        # orphaned on disk forever.
        old_file_name = document.file.name
        document.file.save(document.name, new_file, save=False)
        document.size_bytes = len(content)
        document.updated_by = acting_user
        document.save()
        if old_file_name and old_file_name != document.file.name:
            document.file.storage.delete(old_file_name)
        return JsonResponse({'error': 0})
