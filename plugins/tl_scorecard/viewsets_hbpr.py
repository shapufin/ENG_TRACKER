"""HBPR workspace endpoints: assignment-backed cadence/EPR overview and the
in-scope people list. Both are read-only and strictly assignment-scoped."""
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.users.services.hbpr_scope import get_hbpr_scope
from core.mixins.permissions import PluginPermissionMixin

from . import hbpr_records, services_hbpr

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
        try:
            year = services_hbpr.parse_reporting_year(request.query_params.get('year'))
        except ValueError as exc:
            raise ValidationError({'year': str(exc)})
        return Response(services_hbpr.overview(self._scope(request), reporting_year=year))

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

    @action(detail=False, methods=['get'])
    def records(self, request):
        """One server-side page of a single governance record kind.

        ``?kind=`` is required (``meetings|idle|absences|reviews|pips|promotions``);
        ``leader``, ``status``, ``period`` (YYYY-MM), ``limit``, ``offset`` are optional.
        The page is produced by the resource's own viewset, so scope and redaction
        are exactly what that viewset would apply to this HBPR.
        """
        self._scope(request)  # HBPR only; also memoises the scope for the viewset
        params = request.query_params
        try:
            limit = min(int(params.get('limit', 25)), MAX_PAGE_SIZE)
            offset = int(params.get('offset', 0))
            leader = int(params['leader']) if params.get('leader') else None
        except ValueError:
            raise ValidationError('limit, offset and leader must be integers.')
        if limit < 1 or offset < 0:
            raise ValidationError('limit must be positive and offset non-negative.')
        return Response(hbpr_records.records_page(
            request, kind=params.get('kind'), leader=leader,
            status=params.get('status'), period=params.get('period'),
            limit=limit, offset=offset,
        ))
