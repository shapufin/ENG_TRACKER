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
from .services import is_stale, weighted_avg_tta_hours, weighted_mean


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
                'avg_tta_hours': None,
                'score_speed': None,
                'score_approval_rate': None,
                'score_activity': None,
                'score_consistency': None,
                'decisions_during_leave': 0,
                'is_stale': False,
                'computed_at': None,
            })

        team_size = sum(r.team_size for r in rows)
        active_submitters = sum(r.active_submitters for r in rows)
        resubmission_count = sum(r.resubmission_count for r in rows)
        decisions_during_leave = sum(r.decisions_during_leave for r in rows)
        total_decided = sum(
            sum(m.get('decided', 0) for m in r.metrics.values()) for r in rows
        )
        total_approved = sum(
            sum(m.get('approved', 0) for m in r.metrics.values()) for r in rows
        )
        approval_rate_pct = (
            round((total_approved / total_decided) * 100, 2) if total_decided else None
        )

        avg_tta_hours = weighted_avg_tta_hours(rows)

        def _field_weighted_mean(field):
            return weighted_mean((getattr(r, field), r.team_size) for r in rows)

        engagement_score = _field_weighted_mean('engagement_score')
        score_speed = _field_weighted_mean('score_speed')
        score_approval_rate = _field_weighted_mean('score_approval_rate')
        score_activity = _field_weighted_mean('score_activity')
        score_consistency = _field_weighted_mean('score_consistency')
        computed_at = max((r.computed_at for r in rows if r.computed_at), default=None)

        return Response({
            'month': rows[0].month.isoformat(),
            'team_count': len(rows),
            'team_size': team_size,
            'active_submitters': active_submitters,
            'approval_rate_pct': approval_rate_pct,
            'resubmission_count': resubmission_count,
            'engagement_score': engagement_score,
            'avg_tta_hours': avg_tta_hours,
            'score_speed': score_speed,
            'score_approval_rate': score_approval_rate,
            'score_activity': score_activity,
            'score_consistency': score_consistency,
            'decisions_during_leave': decisions_during_leave,
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
            bucket = by_month.setdefault(row.month, {'rows': [], 'decisions_during_leave': 0})
            bucket['rows'].append(row)
            bucket['decisions_during_leave'] += row.decisions_during_leave

        results = []
        for month in sorted(by_month):
            bucket = by_month[month]
            results.append({
                'month': month.isoformat(),
                'engagement_score': weighted_mean(
                    (r.engagement_score, r.team_size or 1) for r in bucket['rows']
                ),
                'avg_tta_hours': weighted_avg_tta_hours(bucket['rows']),
                'decisions_during_leave': bucket['decisions_during_leave'],
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
            target_rows = list(base_qs.filter(month__year=month.year))
            trend_rows = target_rows
            period_label = str(month.year)
        else:
            target_rows = list(base_qs.filter(month=month))
            window_start = month - relativedelta(months=5)
            trend_rows = list(base_qs.filter(month__gte=window_start, month__lte=month))
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
