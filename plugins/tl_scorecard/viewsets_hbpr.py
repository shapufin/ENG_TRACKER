"""HBPR dashboard endpoints: needs-attention counts, per-TL table, people list."""
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.users.services.hbpr_scope import get_hbpr_scope
from core.mixins.permissions import PluginPermissionMixin

from . import services_hbpr

MAX_PAGE_SIZE = 100


class HbprViewSet(PluginPermissionMixin, viewsets.ViewSet):
    plugin_name = 'tl_scorecard'
    pagination_class = None

    def _scope(self, request):
        scope = get_hbpr_scope(request.user)
        if scope is None:
            raise PermissionDenied('Only HR business partners can open this view.')
        return scope

    @action(detail=False, methods=['get'])
    def overview(self, request):
        return Response(services_hbpr.overview(self._scope(request)))

    @action(detail=False, methods=['get'])
    def people(self, request):
        scope = self._scope(request)
        try:
            limit = min(int(request.query_params.get('limit', 50)), MAX_PAGE_SIZE)
            offset = int(request.query_params.get('offset', 0))
        except ValueError:
            raise ValidationError('limit and offset must be integers.')
        if limit < 1 or offset < 0:
            raise ValidationError('limit must be positive and offset non-negative.')
        search = request.query_params.get('q', '').strip()[:100]
        return Response(services_hbpr.people(scope, search, limit, offset))
