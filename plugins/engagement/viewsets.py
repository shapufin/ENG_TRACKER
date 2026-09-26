"""
Read-only TL engagement metrics endpoints.

All data is served from `TLApprovalMetric` snapshots (never computed at
request time). `view` access is TL-only via the plugin permission manifest;
row-level scoping additionally restricts non-staff users to their own
(leader=request.user) rows.
"""
from datetime import date

from dateutil.relativedelta import relativedelta
from django.http import HttpResponse
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from core.mixins.permissions import PluginPermissionMixin

from .excel_export import build_workbook_bytes
from .models import TLApprovalMetric
from .serializers import TLApprovalMetricSerializer
from .services import aggregate_rows, compute_tl_metric, is_stale, weighted_avg_tta_hours, weighted_mean


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

    def _ensure_fresh(self, rows):
        """Recompute any stale snapshot in place before serving it, so every
        read reflects current data at click-time — no scheduled job needed."""
        return [
            compute_tl_metric(row.leader, row.team, row.month) if is_stale(row) else row
            for row in rows
        ]

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

        rows = self._ensure_fresh(list(qs))
        if not rows:
            return Response({
                'month': month.isoformat() if month else None,
                'team_count': 0,
                'team_size': 0,
                'active_submitters': 0,
                'approval_rate_pct': None,
                'resubmission_count': 0,
                'engagement_score': None,
                'avg_tta_hours': None,
                'score_speed': None,
                'score_approval_rate': None,
                'score_activity': None,
                'score_consistency': None,
                'decisions_during_leave': 0,
                'is_stale': False,
                'computed_at': None,
            })

        agg = aggregate_rows(rows)
        computed_at = agg['computed_at']

        return Response({
            'month': rows[0].month.isoformat(),
            'team_count': len(rows),
            'team_size': agg['team_size'],
            'active_submitters': agg['active_submitters'],
            'approval_rate_pct': agg['approval_rate_pct'],
            'resubmission_count': agg['resubmission_count'],
            'engagement_score': agg['engagement_score'],
            'avg_tta_hours': agg['avg_tta_hours'],
            'score_speed': agg['score_speed'],
            'score_approval_rate': agg['score_approval_rate'],
            'score_activity': agg['score_activity'],
            'score_consistency': agg['score_consistency'],
            'decisions_during_leave': agg['decisions_during_leave'],
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
        for row in self._ensure_fresh(list(qs)):
            bucket = by_month.setdefault(row.month, {'rows': [], 'decisions_during_leave': 0})
            bucket['rows'].append(row)
            bucket['decisions_during_leave'] += row.decisions_during_leave

        def _bucket_weighted_mean(rows, field):
            return weighted_mean((getattr(r, field), r.team_size) for r in rows)

        results = []
        for month in sorted(by_month):
            bucket = by_month[month]
            results.append({
                'month': month.isoformat(),
                'engagement_score': _bucket_weighted_mean(bucket['rows'], 'engagement_score'),
                'avg_tta_hours': weighted_avg_tta_hours(bucket['rows']),
                'decisions_during_leave': bucket['decisions_during_leave'],
                'score_speed': _bucket_weighted_mean(bucket['rows'], 'score_speed'),
                'score_approval_rate': _bucket_weighted_mean(bucket['rows'], 'score_approval_rate'),
                'score_activity': _bucket_weighted_mean(bucket['rows'], 'score_activity'),
                'score_consistency': _bucket_weighted_mean(bucket['rows'], 'score_consistency'),
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

        rows = self._ensure_fresh(list(qs))
        return Response(TLApprovalMetricSerializer(rows, many=True).data)

    @action(detail=False, methods=['get'])
    def status(self, request):
        qs = self._base_queryset(request)
        latest = qs.order_by('-month').values_list('month', flat=True).first()
        if not latest:
            return Response({'has_data': False, 'is_stale': False, 'computed_at': None})
        rows = self._ensure_fresh(list(qs.filter(month=latest)))
        computed_at = max((r.computed_at for r in rows if r.computed_at), default=None)
        return Response({
            'has_data': True,
            'month': latest.isoformat(),
            'is_stale': any(is_stale(r) for r in rows),
            'computed_at': computed_at.isoformat() if computed_at else None,
        })

    @action(detail=False, methods=['get'])
    def export(self, request):
        """Download the KPI-evidence workbook. ?month=YYYY-MM-DD&scope=month|year."""
        try:
            month = _parse_month(request.query_params.get('month'))
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        if not month:
            return Response({'error': 'month is required'}, status=status.HTTP_400_BAD_REQUEST)

        scope = request.query_params.get('scope', 'month')
        if scope not in ('month', 'year'):
            return Response({'error': 'scope must be "month" or "year"'}, status=status.HTTP_400_BAD_REQUEST)

        base_qs = self._base_queryset(request)

        if scope == 'year':
            target_rows = self._ensure_fresh(list(base_qs.filter(month__year=month.year)))
            trend_rows = target_rows
            period_label = str(month.year)
        else:
            target_rows = self._ensure_fresh(list(base_qs.filter(month=month)))
            window_start = month - relativedelta(months=5)
            trend_rows = self._ensure_fresh(list(base_qs.filter(month__gte=window_start, month__lte=month)))
            period_label = month.strftime('%B %Y')

        workbook_bytes = build_workbook_bytes(target_rows, trend_rows, scope, period_label)

        filename_period = str(month.year) if scope == 'year' else month.strftime('%Y-%m')
        filename = f'engagement_{scope}_{request.user.username}_{filename_period}.xlsx'
        response = HttpResponse(
            workbook_bytes,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
