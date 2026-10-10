"""
Read-only TL engagement metrics endpoints.

Data is served from `TLApprovalMetric` snapshots. Any snapshot that is stale
(data changed, or a pending deadline has passed) is recomputed before it is
served, so each read reflects current data. `view` access is TL-only via the
plugin permission manifest (HBPR is explicitly denied); non-staff users see
only their own rows, staff see every TL.
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
from .services import (
    ReadScope,
    aggregate_rows,
    compute_tl_metric,
    ensure_current_month_snapshots,
    stale_snapshot_ids,
    weighted_avg_tta_hours,
    weighted_mean,
)
from .sla import today_local


def _parse_month(raw):
    if not raw:
        return None
    try:
        parsed = date.fromisoformat(raw)
    except ValueError:
        raise ValueError('month must be an ISO date (YYYY-MM-DD)')
    return parsed.replace(day=1)


def _trend_months(request):
    try:
        months_back = int(request.query_params.get('months', 6))
    except ValueError:
        raise ValueError('months must be an integer')
    return max(1, min(months_back, 24))


def _trend_start(months_back):
    return today_local().replace(day=1) - relativedelta(months=months_back - 1)


class TLEngagementMetricsViewSet(PluginPermissionMixin, viewsets.ViewSet):
    plugin_name = 'engagement'
    pagination_class = None

    def _scope(self):
        """One scope memo per request: DRF builds a new viewset instance per request."""
        if not hasattr(self, '_read_scope'):
            self._read_scope = ReadScope()
        return self._read_scope

    def _base_queryset(self, request):
        # Deactivated TLs drop off every read surface: their rows are no longer
        # refreshed, so showing them would present numbers that can silently age.
        qs = TLApprovalMetric.objects.select_related('leader', 'team').filter(leader__is_active=True)
        user = request.user
        if user.is_staff or user.is_superuser:
            ensure_current_month_snapshots(scope=self._scope())
            return qs
        # HBPR has no Engagement access at all (denied at the plugin-permission
        # level), and the role must never broaden this viewset even for a
        # multi-role HBPR+TL user: only the viewer's own TL rows are visible.
        ensure_current_month_snapshots({user.id}, scope=self._scope())
        return qs.filter(leader=user)

    def _refresh(self, rows):
        """Recompute stale snapshots in place before serving them.

        Returns (rows, refreshed): `refreshed` is True when at least one row was
        recomputed by this read, so the page can say the numbers just changed.
        """
        rows = list(rows)
        scope = self._scope()
        stale = stale_snapshot_ids(rows, scope)
        fresh = [compute_tl_metric(row.leader, row.team, row.month, scope) if row.pk in stale else row for row in rows]
        return fresh, bool(stale)

    def _ensure_fresh(self, rows):
        return self._refresh(rows)[0]

    def _latest_or_requested(self, qs, month):
        if month:
            return qs.filter(month=month)
        latest = qs.order_by('-month').values_list('month', flat=True).first()
        return qs.filter(month=latest) if latest else qs.none()

    @staticmethod
    def _summary_payload(rows, refreshed, month):
        if not rows:
            return {
                'month': month.isoformat() if month else None,
                'team_count': 0,
                'team_size': 0,
                'active_submitters': 0,
                'approval_rate_pct': None,
                'resubmission_count': 0,
                'decisions_during_leave': 0,
                'decisions_on_holidays': 0,
                'judgeable': 0,
                'on_time': 0,
                'breaches': 0,
                'pending_past_deadline': 0,
                'engagement_score': None,
                'avg_tta_hours': None,
                'score_speed': None,
                'score_approval_rate': None,
                'score_responsiveness': None,
                'score_consistency': None,
                'refreshed_on_read': False,
                'computed_at': None,
            }
        agg = aggregate_rows(rows)
        return {
            'month': rows[0].month.isoformat(),
            'team_count': len(rows),
            **{k: v for k, v in agg.items() if k != 'computed_at'},
            'refreshed_on_read': refreshed,
            'computed_at': agg['computed_at'].isoformat() if agg['computed_at'] else None,
        }

    @staticmethod
    def _trend_payload(rows):
        by_month = {}
        for row in rows:
            by_month.setdefault(row.month, []).append(row)
        results = []
        for month in sorted(by_month):
            month_rows = by_month[month]
            results.append({
                'month': month.isoformat(),
                'engagement_score': weighted_mean((r.engagement_score, r.team_size) for r in month_rows),
                'avg_tta_hours': weighted_avg_tta_hours(month_rows),
                'decisions_during_leave': sum(r.decisions_during_leave for r in month_rows),
                'decisions_on_holidays': sum(r.decisions_on_holidays for r in month_rows),
                'score_speed': weighted_mean((r.score_speed, r.team_size) for r in month_rows),
                'score_approval_rate': weighted_mean((r.score_approval_rate, r.team_size) for r in month_rows),
                'score_responsiveness': weighted_mean((r.score_responsiveness, r.team_size) for r in month_rows),
                'score_consistency': weighted_mean((r.score_consistency, r.team_size) for r in month_rows),
            })
        return results

    @staticmethod
    def _breakdown_payload(rows):
        return TLApprovalMetricSerializer(rows, many=True).data

    @action(detail=False, methods=['get'])
    def summary(self, request):
        try:
            month = _parse_month(request.query_params.get('month'))
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        rows, refreshed = self._refresh(list(self._latest_or_requested(self._base_queryset(request), month)))
        return Response(self._summary_payload(rows, refreshed, month))

    @action(detail=False, methods=['get'])
    def trend(self, request):
        try:
            months_back = _trend_months(request)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        qs = self._base_queryset(request).filter(month__gte=_trend_start(months_back))
        return Response(self._trend_payload(self._ensure_fresh(list(qs))))

    @action(detail=False, methods=['get'], url_path='team-breakdown')
    def team_breakdown(self, request):
        try:
            month = _parse_month(request.query_params.get('month'))
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        rows = self._ensure_fresh(list(self._latest_or_requested(self._base_queryset(request), month)))
        return Response(self._breakdown_payload(rows))

    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        """Everything the engagement page shows, in one request: summary, trend and
        team breakdown. Each part is the same payload as its own endpoint, but the
        scope and freshness work is done once for the whole page."""
        try:
            month = _parse_month(request.query_params.get('month'))
            months_back = _trend_months(request)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        base = self._base_queryset(request)
        rows, refreshed = self._refresh(list(self._latest_or_requested(base, month)))
        trend_rows = self._ensure_fresh(list(base.filter(month__gte=_trend_start(months_back))))
        return Response({
            'summary': self._summary_payload(rows, refreshed, month),
            'trend': self._trend_payload(trend_rows),
            'team_breakdown': self._breakdown_payload(rows),
        })

    @action(detail=False, methods=['get'])
    def status(self, request):
        qs = self._base_queryset(request)
        latest = qs.order_by('-month').values_list('month', flat=True).first()
        if not latest:
            return Response({'has_data': False, 'refreshed_on_read': False, 'computed_at': None})
        rows, refreshed = self._refresh(list(qs.filter(month=latest)))
        computed_at = max((r.computed_at for r in rows if r.computed_at), default=None)
        return Response({
            'has_data': True,
            'month': latest.isoformat(),
            'refreshed_on_read': refreshed,
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
            target_rows = trend_rows = self._ensure_fresh(list(base_qs.filter(month__year=month.year)))
            period_label = str(month.year)
        else:
            # One fetch and one freshness pass cover both the month and its trend window.
            window_start = month - relativedelta(months=5)
            trend_rows = self._ensure_fresh(list(base_qs.filter(month__gte=window_start, month__lte=month)))
            target_rows = [row for row in trend_rows if row.month == month]
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
