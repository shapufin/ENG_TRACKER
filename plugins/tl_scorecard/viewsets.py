"""
Phase 1 TL Scorecard endpoints. All computation is live (services.py) —
there's no snapshot model yet in this phase.
"""
from datetime import date

from django.contrib.auth.models import User
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response

from core.mixins.permissions import PluginPermissionMixin

from .serializers import KpiCoverageEntrySerializer, ScorecardSerializer
from .services import KPI_COVERAGE, build_scorecard


def _parse_month(raw):
    if not raw:
        return None
    try:
        parsed = date.fromisoformat(raw)
    except ValueError:
        raise ValueError('month must be an ISO date (YYYY-MM-DD)')
    return parsed.replace(day=1)


class TLScorecardViewSet(PluginPermissionMixin, viewsets.ViewSet):
    plugin_name = 'tl_scorecard'
    permission_action_map = {'kpi_coverage': 'view'}

    def _resolve_leader(self, request):
        """A TL always sees their own scorecard. Staff/superuser may pass
        `?leader_id=` to view any TL's — same shape as this app's reports
        endpoints, which let staff pick a target rather than aggregating
        across everyone by default."""
        leader_id = request.query_params.get('leader_id')
        if not leader_id:
            return request.user
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied('Only staff can view another TL\'s scorecard.')
        try:
            return User.objects.get(pk=leader_id)
        except User.DoesNotExist:
            raise NotFound('leader_id does not match an existing user.')

    @action(detail=False, methods=['get'])
    def scorecard(self, request):
        try:
            month = _parse_month(request.query_params.get('month'))
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        leader = self._resolve_leader(request)
        if not hasattr(leader, 'profile'):
            return Response({'error': 'This user has no profile to resolve a team from.'},
                             status=status.HTTP_400_BAD_REQUEST)

        data = build_scorecard(leader, month or date.today())
        return Response(ScorecardSerializer(data).data)

    @action(detail=False, methods=['get'], url_path='kpi-coverage', url_name='kpi-coverage')
    def kpi_coverage(self, request):
        return Response(KpiCoverageEntrySerializer(KPI_COVERAGE, many=True).data)
