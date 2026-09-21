"""
Read-only TL engagement metrics endpoints.

All data is served from `TLApprovalMetric` snapshots (never computed at
request time). `view` access is TL-only via the plugin permission manifest;
row-level scoping additionally restricts non-staff users to their own
(leader=request.user) rows.
"""
from datetime import date

from dateutil.relativedelta import relativedelta
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from core.mixins.permissions import PluginPermissionMixin

from .models import TLApprovalMetric
from .serializers import TLApprovalMetricSerializer
from .services import is_stale


def _parse_month(raw):
    if not raw:
        return None
    try:
        parsed = date.fromisoformat(raw)
    except ValueError:
        raise ValueError('month must be an ISO date (YYYY-MM-DD)')
    return parsed.replace(day=1)


class TLEngagementMetricsViewSet(PluginPermissionMixin, viewsets.ViewSet):
    plugin_name = 'engagement'
    pagination_class = None

    def _base_queryset(self, request):
        qs = TLApprovalMetric.objects.select_related('leader', 'team')
        if not (request.user.is_staff or request.user.is_superuser):
            qs = qs.filter(leader=request.user)
        return qs

    @action(detail=False, methods=['get'])
    def summary(self, request):
        try:
            month = _parse_month(request.query_params.get('month'))
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        qs = self._base_queryset(request)
        if month:
            qs = qs.filter(month=month)
        else:
            latest = qs.order_by('-month').values_list('month', flat=True).first()
            qs = qs.filter(month=latest) if latest else qs.none()

        rows = list(qs)
        if not rows:
            return Response({
                'month': month.isoformat() if month else None,
                'team_count': 0,
                'team_size': 0,
                'active_submitters': 0,
                'approval_rate_pct': None,
                'resubmission_count': 0,
                'engagement_score': None,
                'is_stale': False,
                'computed_at': None,
            })

        team_size = sum(r.team_size for r in rows)
        active_submitters = sum(r.active_submitters for r in rows)
        resubmission_count = sum(r.resubmission_count for r in rows)
        total_decided = sum(
            sum(m.get('decided', 0) for m in r.metrics.values()) for r in rows
        )
        total_approved = sum(
            sum(m.get('approved', 0) for m in r.metrics.values()) for r in rows
        )
        approval_rate_pct = (
            round((total_approved / total_decided) * 100, 2) if total_decided else None
        )
        scored = [(r.engagement_score, r.team_size) for r in rows if r.engagement_score is not None]
        if scored:
            weight_sum = sum(w for _, w in scored) or len(scored)
            engagement_score = round(
                sum(s * (w or 1) for s, w in scored) / weight_sum, 2
            )
        else:
            engagement_score = None
        computed_at = max((r.computed_at for r in rows if r.computed_at), default=None)

        return Response({
            'month': rows[0].month.isoformat(),
            'team_count': len(rows),
            'team_size': team_size,
            'active_submitters': active_submitters,
            'approval_rate_pct': approval_rate_pct,
            'resubmission_count': resubmission_count,
            'engagement_score': engagement_score,
            'is_stale': any(is_stale(r) for r in rows),
            'computed_at': computed_at.isoformat() if computed_at else None,
        })

    @action(detail=False, methods=['get'])
    def trend(self, request):
        try:
            months_back = int(request.query_params.get('months', 6))
        except ValueError:
            return Response({'error': 'months must be an integer'}, status=status.HTTP_400_BAD_REQUEST)
        months_back = max(1, min(months_back, 24))

        today = date.today().replace(day=1)
        earliest = today - relativedelta(months=months_back - 1)
        qs = self._base_queryset(request).filter(month__gte=earliest)

        by_month = {}
        for row in qs:
            bucket = by_month.setdefault(row.month, {'scores': [], 'tta_weighted': [], 'tta_weight': []})
            if row.engagement_score is not None:
                bucket['scores'].append((row.engagement_score, row.team_size or 1))
            for type_metrics in row.metrics.values():
                if type_metrics.get('avg_tta_hours') is not None:
                    weight = type_metrics.get('decided', 0) or 1
                    bucket['tta_weighted'].append(type_metrics['avg_tta_hours'] * weight)
                    bucket['tta_weight'].append(weight)

        results = []
        for month in sorted(by_month):
            bucket = by_month[month]
            if bucket['scores']:
                w_sum = sum(w for _, w in bucket['scores'])
                score = round(sum(s * w for s, w in bucket['scores']) / w_sum, 2)
            else:
                score = None
            if bucket['tta_weight']:
                avg_tta = round(sum(bucket['tta_weighted']) / sum(bucket['tta_weight']), 2)
            else:
                avg_tta = None
            results.append({
                'month': month.isoformat(),
                'engagement_score': score,
                'avg_tta_hours': avg_tta,
            })
        return Response(results)

    @action(detail=False, methods=['get'], url_path='team-breakdown')
    def team_breakdown(self, request):
        try:
            month = _parse_month(request.query_params.get('month'))
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        qs = self._base_queryset(request)
        if month:
            qs = qs.filter(month=month)
        else:
            latest = qs.order_by('-month').values_list('month', flat=True).first()
            qs = qs.filter(month=latest) if latest else qs.none()

        return Response(TLApprovalMetricSerializer(qs, many=True).data)

    @action(detail=False, methods=['get'])
    def status(self, request):
        qs = self._base_queryset(request)
        latest = qs.order_by('-month').values_list('month', flat=True).first()
        if not latest:
            return Response({'has_data': False, 'is_stale': False, 'computed_at': None})
        rows = list(qs.filter(month=latest))
        computed_at = max((r.computed_at for r in rows if r.computed_at), default=None)
        return Response({
            'has_data': True,
            'month': latest.isoformat(),
            'is_stale': any(is_stale(r) for r in rows),
            'computed_at': computed_at.isoformat() if computed_at else None,
        })
