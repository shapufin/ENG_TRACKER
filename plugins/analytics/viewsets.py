from rest_framework import viewsets, status, permissions, mixins
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from rest_framework.throttling import UserRateThrottle
from django.utils import timezone
from django.db.models import Sum, Q, Count
from django.db.models.functions import TruncDay, TruncMonth
from django.http import HttpResponse, FileResponse
from datetime import timedelta, datetime

from django.contrib.auth.models import User
from core.utils import get_client_ip
from .models import AnalyticsSnapshot, AnalyticsMetric, AnalyticsConfiguration, ScheduledReport, ReportTemplate, ExportJob
from .serializers import (
    AnalyticsSnapshotSerializer, AnalyticsMetricSerializer,
    AnalyticsConfigurationSerializer,
    ScheduledReportSerializer, ReportTemplateSerializer
)
from .reports import AnalyticsReportGenerator
from .providers import analytics_registry
from .insights import generate_insights
from .export_service import ExportRunner
from apps.leave_management.models import LeaveRequest
from apps.overtime.models import OvertimeLog
from apps.standby.models import StandbyLog
from core.mixins.permissions import PluginPermissionMixin


def safe_aggregate(queryset, field, default=0):
    """Safely aggregate a field, returning default if None."""
    result = queryset.aggregate(total=Sum(field))['total']
    return float(result) if result is not None else float(default)


def _compute_analytics_filters(request):
    """
    Shared filter computation for metrics and trends endpoints.
    Returns (start_date, end_date, leave_filters, overtime_filters,
             standby_filters, categories, period).
    """
    from django.utils.dateparse import parse_date

    period = request.query_params.get('period', 'month')
    date_from = request.query_params.get('date_from')
    date_to = request.query_params.get('date_to')
    teams = request.query_params.getlist('teams')
    users = request.query_params.getlist('users')
    statuses = request.query_params.getlist('status')
    categories = request.query_params.getlist('category')

    now = timezone.now()
    if date_from and date_to:
        try:
            start_date_obj = parse_date(date_from)
            end_date_obj = parse_date(date_to)
            if start_date_obj and end_date_obj:
                start_date = timezone.make_aware(datetime.combine(start_date_obj, datetime.min.time()))
                end_date = timezone.make_aware(datetime.combine(end_date_obj, datetime.max.time()))
            else:
                raise ValueError("Invalid date format")
        except (ValueError, TypeError):
            start_date = now - timedelta(days=30)
            end_date = now
    elif period == 'week':
        start_date = now - timedelta(days=7)
        end_date = now
    elif period == 'year':
        start_date = now - timedelta(days=365)
        end_date = now
    else:  # month (default)
        start_date = now - timedelta(days=30)
        end_date = now

    leave_filters = Q(created_at__gte=start_date, created_at__lte=end_date)
    overtime_filters = Q(
        date__gte=start_date.date(),
        date__lte=end_date.date(),
    )
    standby_filters = Q(
        date__gte=start_date.date(),
        date__lte=end_date.date(),
    )

    if teams:
        from apps.users.models.core import UserProfile
        team_user_ids = list(
            UserProfile.objects.filter(teams__name__in=teams)
            .values_list('user_id', flat=True)
            .distinct()
        )
        leave_filters &= Q(user_id__in=team_user_ids)
        overtime_filters &= Q(user_id__in=team_user_ids)
        standby_filters &= Q(user_id__in=team_user_ids)

    if users:
        leave_filters &= Q(user_id__in=users)
        overtime_filters &= Q(user_id__in=users)
        standby_filters &= Q(user_id__in=users)

    if statuses:
        leave_filters &= Q(status__in=statuses)
        overtime_filters &= Q(status__in=statuses)
        standby_filters &= Q(status__in=statuses)

    return (start_date, end_date, leave_filters, overtime_filters,
            standby_filters, categories, period)


class AnalyticsSnapshotViewSet(PluginPermissionMixin, viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for analytics snapshots.
    Provides historical analytics data.
    
    Note: This endpoint aggregates data across all teams/users.
    Access is restricted to users with 'analytics.view' permission.
    """
    plugin_name = 'analytics'
    queryset = AnalyticsSnapshot.objects.all()
    serializer_class = AnalyticsSnapshotSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = PageNumberPagination
    filterset_fields = ['snapshot_type', 'snapshot_date']
    ordering_fields = ['snapshot_date', 'created_at']
    ordering = ['-snapshot_date']

    @action(detail=False, methods=['get'])
    def latest(self, request):
        """Get the latest snapshot."""
        latest = self.get_queryset().first()
        if not latest:
            return Response({'detail': 'No snapshots available'}, status=status.HTTP_404_NOT_FOUND)
        serializer = self.get_serializer(latest)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def by_type(self, request):
        """Get latest snapshot by type."""
        snapshot_type = request.query_params.get('type', 'daily')
        latest = self.get_queryset().filter(snapshot_type=snapshot_type).first()
        if not latest:
            return Response({'detail': f'No {snapshot_type} snapshots available'}, status=status.HTTP_404_NOT_FOUND)
        serializer = self.get_serializer(latest)
        return Response(serializer.data)


class AnalyticsMetricViewSet(PluginPermissionMixin,
                             mixins.ListModelMixin,
                             mixins.RetrieveModelMixin,
                             viewsets.GenericViewSet):
    """
    ViewSet for analytics metrics.
    Provides detailed metric data points.
    """
    plugin_name = 'analytics'
    # The export action requires the dedicated 'export' plugin permission
    # (not just 'view'); other reads fall back to 'view'.
    permission_action_map = {'download_report': 'export'}
    queryset = AnalyticsMetric.objects.select_related('user', 'team')
    serializer_class = AnalyticsMetricSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = PageNumberPagination
    filterset_fields = ['metric_type', 'user', 'team']
    ordering_fields = ['recorded_at', 'created_at', 'value']
    ordering = ['-recorded_at']

    def list(self, request, *args, **kwargs):
        """
        Get analytics metrics for dashboard.
        Returns overview metrics, recent snapshots, and plugin-contributed metrics.
        """
        (start_date, end_date, leave_filters, overtime_filters,
         standby_filters, categories, period) = _compute_analytics_filters(request)

        # 1. Base Metrics (Core)
        # Leave metrics
        leave_requests = LeaveRequest.objects.filter(leave_filters)
        if not categories or 'leave' in categories:
            total_leave = leave_requests.count()
            approved_leave = leave_requests.filter(status='approved').count()
            pending_leave = leave_requests.filter(status='pending').count()
        else:
            total_leave = approved_leave = pending_leave = 0

        # Overtime metrics
        overtime_logs = OvertimeLog.objects.filter(overtime_filters)
        if not categories or 'overtime' in categories:
            overtime_aggs = overtime_logs.aggregate(
                total_hours=Sum('hours'),
            )
            total_hours = float(overtime_aggs['total_hours'] or 0)
        else:
            total_hours = 0

        # Standby metrics (map pending→scheduled, approved→completed for Analytics compatibility)
        standby_logs = StandbyLog.objects.filter(standby_filters)
        if not categories or 'standby' in categories:
            total_standby_hours = safe_aggregate(standby_logs, 'hours')
        else:
            total_standby_hours = 0

        # Team and user counts
        from apps.users.models.core import Team
        Team.objects.count()
        user_count = User.objects.count()
        active_user_count = User.objects.filter(is_active=True).count()

        # Calculate trends (compare with previous period of equal length)
        period_length = (end_date - start_date).days + 1
        prev_start = start_date - timedelta(days=period_length)
        prev_leave = LeaveRequest.objects.filter(created_at__gte=prev_start, created_at__lt=start_date).count()
        prev_overtime = safe_aggregate(OvertimeLog.objects.filter(created_at__gte=prev_start, created_at__lt=start_date), 'hours')
        prev_standby = safe_aggregate(StandbyLog.objects.filter(created_at__gte=prev_start, created_at__lt=start_date), 'hours')
        prev_user_count = User.objects.filter(date_joined__gte=prev_start, date_joined__lt=start_date).count()
        prev_active_user_count = User.objects.filter(date_joined__gte=prev_start, date_joined__lt=start_date, is_active=True).count()

        # Calculate percentage changes
        user_change = ((user_count - prev_user_count) / prev_user_count * 100) if prev_user_count > 0 else 0
        active_user_change = ((active_user_count - prev_active_user_count) / prev_active_user_count * 100) if prev_active_user_count > 0 else 0
        leave_change = ((total_leave - prev_leave) / prev_leave * 100) if prev_leave > 0 else 0
        overtime_change = ((total_hours - prev_overtime) / prev_overtime * 100) if prev_overtime > 0 else 0
        standby_change = ((total_standby_hours - prev_standby) / prev_standby * 100) if prev_standby > 0 else 0

        # Determine trend direction
        def get_trend(change):
            if change > 0:
                return 'up'
            elif change < 0:
                return 'down'
            return 'stable'

        # Build core metrics array — include all computed datasets
        metrics = [
            {
                'name': 'Total Users',
                'value': user_count,
                'change': round(user_change, 1),
                'trend': get_trend(user_change)
            },
            {
                'name': 'Active Users',
                'value': active_user_count,
                'change': round(active_user_change, 1),
                'trend': get_trend(active_user_change)
            },
            {
                'name': 'Leave Requests',
                'value': total_leave,
                'change': round(leave_change, 1),
                'trend': get_trend(leave_change),
                'metadata': {
                    'approved': approved_leave,
                    'pending': pending_leave,
                }
            },
            {
                'name': 'Overtime Hours',
                'value': round(float(total_hours), 1),
                'change': round(float(overtime_change), 1),
                'trend': get_trend(overtime_change)
            },
            {
                'name': 'Standby Hours',
                'value': round(float(total_standby_hours), 1),
                'change': round(float(standby_change), 1),
                'trend': get_trend(standby_change)
            }
        ]

        # 2. Advanced Metrics (Providers)
        for provider in analytics_registry.get_all_providers().values():
            try:
                provider_metrics = provider.get_metrics(period=period)
                metrics.extend(provider_metrics)
            except Exception as e:
                import logging
                logging.getLogger(__name__).error(f"Error getting metrics from {provider.provider_name}: {e}")

        # Get all snapshots in the selected period (newest first for the table;
        # the frontend chart reverses to chronological order). Previously capped
        # at 10, which hid most data for week/year periods.
        recent_snapshots = list(AnalyticsSnapshot.objects.filter(
            snapshot_date__gte=start_date
        ).order_by('-snapshot_date'))

        data = {
            'total_snapshots': len(recent_snapshots),
            'metrics': metrics,
            'recent_snapshots': [
                {
                    'id': s.id,
                    'timestamp': s.snapshot_date.isoformat(),
                    'total_users': s.total_users if hasattr(s, 'total_users') else 0,
                    'active_users': s.active_users if hasattr(s, 'active_users') else 0,
                    'total_hours': float(s.total_hours) if hasattr(s, 'total_hours') else 0,
                    'average_hours': float(s.average_hours) if hasattr(s, 'average_hours') else 0,
                    'overtime_hours': float(s.overtime_approved_hours) if hasattr(s, 'overtime_approved_hours') else 0,
                    'standby_hours': float(s.standby_completed_count * 8) if hasattr(s, 'standby_completed_count') else 0,
                }
                for s in recent_snapshots
            ]
        }

        return Response(data)

    @action(detail=False, methods=['get'])
    def hotspots(self, request):
        """Get overtime hotspots from registered providers."""
        period = request.query_params.get('period', 'month')
        now = timezone.now()
        if period == 'week':
            start_date = now - timedelta(days=7)
        elif period == 'year':
            start_date = now - timedelta(days=365)
        else:
            start_date = now - timedelta(days=30)
        
        all_hotspots = []
        for provider in analytics_registry.get_all_providers().values():
            if hasattr(provider, 'get_hotspots'):
                try:
                    all_hotspots.extend(provider.get_hotspots(start_date))
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).error(f"Error getting hotspots from {provider.provider_name}: {e}")
        
        return Response(all_hotspots)

    @action(detail=False, methods=['get'])
    def insights(self, request):
        """
        Get automated insights — trend changes, anomalies, concentration
        risks, backlog alerts, and daily spikes. Generated in real-time
        from the filtered OT/standby/leave data.
        """
        (start_date, end_date, leave_filters, overtime_filters,
         standby_filters, categories, period) = _compute_analytics_filters(request)

        # Extract filter components for previous-period trend comparison
        teams = request.query_params.getlist('teams')
        users = request.query_params.getlist('users')
        statuses = request.query_params.getlist('status')
        team_user_ids = None
        if teams:
            from apps.users.models.core import UserProfile
            team_user_ids = list(
                UserProfile.objects.filter(teams__name__in=teams)
                .values_list('user_id', flat=True)
                .distinct()
            )

        data = generate_insights(
            start_date, end_date, leave_filters, overtime_filters,
            standby_filters, categories,
            team_user_ids=team_user_ids,
            users=users if users else None,
            statuses=statuses if statuses else None,
        )
        return Response(data)

    @action(detail=False, methods=['get'])
    def trends(self, request):
        """
        Get real-time time-series trend data for charts.
        Aggregates OvertimeLog, StandbyLog, and LeaveRequest directly
        (no snapshot dependency) using TruncDay (week/month) or TruncMonth (year).
        """
        (start_date, end_date, leave_filters, overtime_filters,
         standby_filters, categories, period) = _compute_analytics_filters(request)

        trunc = TruncMonth if period == 'year' else TruncDay

        # Overtime trend: hours per period
        overtime_qs = OvertimeLog.objects.filter(overtime_filters)
        if categories and 'overtime' not in categories:
            overtime_trend = []
        else:
            overtime_trend = list(
                overtime_qs.annotate(period=trunc('date'))
                .values('period')
                .annotate(hours=Sum('hours'))
                .order_by('period')
            )

        # Standby trend: hours per period
        standby_qs = StandbyLog.objects.filter(standby_filters)
        if categories and 'standby' not in categories:
            standby_trend = []
        else:
            standby_trend = list(
                standby_qs.annotate(period=trunc('date'))
                .values('period')
                .annotate(hours=Sum('hours'))
                .order_by('period')
            )

        # Leave trend: request count per period, split by status
        # (approved/pending/rejected) for a stacked bar chart.
        leave_qs = LeaveRequest.objects.filter(leave_filters)
        if categories and 'leave' not in categories:
            leave_trend = []
        else:
            leave_trend = list(
                leave_qs.annotate(period=trunc('start_date'))
                .values('period')
                .annotate(
                    count=Count('id'),
                    approved=Count('id', filter=Q(status='approved')),
                    pending=Count('id', filter=Q(status='pending')),
                    rejected=Count('id', filter=Q(status='rejected')),
                )
                .order_by('period')
            )

        # User activity: cumulative total/active users per period
        user_trend = list(
            User.objects.filter(date_joined__gte=start_date, date_joined__lte=end_date)
            .annotate(period=trunc('date_joined'))
            .values('period')
            .annotate(new_users=Count('id'), new_active=Count('id', filter=Q(is_active=True)))
            .order_by('period')
        )

        # Convert datetimes to ISO date strings and Decimals to floats.
        # TruncDay/TruncMonth on a DateField returns a date; on a DateTimeField
        # returns a datetime — handle both.
        def serialize_trend(items, value_fields):
            result = []
            for item in items:
                period_val = item['period']
                if period_val is None:
                    date_str = None
                elif hasattr(period_val, 'date'):
                    date_str = period_val.date().isoformat()
                else:
                    date_str = period_val.isoformat()
                entry = {'date': date_str}
                for field in value_fields:
                    val = item.get(field)
                    entry[field] = float(val) if val is not None else 0
                result.append(entry)
            return result

        data = {
            'overtime': serialize_trend(overtime_trend, ['hours']),
            'standby': serialize_trend(standby_trend, ['hours']),
            'leave': serialize_trend(leave_trend, ['count', 'approved', 'pending', 'rejected']),
            'user_activity': serialize_trend(user_trend, ['new_users', 'new_active']),
        }

        return Response(data)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """
        Get summary analytics data for dashboard widget.
        Returns user statistics, hours overview, and trend indicators.
        """
        from django.contrib.auth.models import User
        
        # Get current period data (last 30 days)
        now = timezone.now()
        start_date = now - timedelta(days=30)
        prev_start = start_date - timedelta(days=30)
        
        # User metrics - use User model for is_active field
        user_count = User.objects.count()
        active_users = User.objects.filter(is_active=True).count()
        
        # User growth: compare users created in current vs previous period
        current_period_users = User.objects.filter(
            date_joined__gte=start_date
        ).count()
        prev_period_users = User.objects.filter(
            date_joined__gte=prev_start,
            date_joined__lt=start_date
        ).count()
        user_growth = ((current_period_users - prev_period_users) / prev_period_users * 100) if prev_period_users > 0 else 0
        
        # Hours metrics - filter by work date if available, otherwise created_at
        overtime_logs = OvertimeLog.objects.filter(created_at__gte=start_date)
        total_hours = safe_aggregate(overtime_logs, 'hours')
        overtime_hours = safe_aggregate(overtime_logs.filter(status='approved'), 'hours')
        
        # Previous period hours for trend
        prev_overtime = safe_aggregate(OvertimeLog.objects.filter(
            created_at__gte=prev_start, 
            created_at__lt=start_date
        ), 'hours')
        hours_trend = ((total_hours - prev_overtime) / prev_overtime * 100) if prev_overtime > 0 else 0
        
        # Calculate average hours
        average_hours = (total_hours / active_users) if active_users > 0 else 0
        
        data = {
            'total_users': user_count,
            'active_users': active_users,
            'total_hours': round(float(total_hours), 1),
            'average_hours': round(float(average_hours), 1),
            'overtime_hours': round(float(overtime_hours), 1),
            'user_growth': round(float(user_growth), 1),
            'hours_trend': round(float(hours_trend), 1),
        }
        
        return Response(data)

    @action(detail=False, methods=['get'], url_path='export', throttle_classes=[UserRateThrottle])
    def download_report(self, request):
        """
        Export analytics data as Multi-sheet Excel, CSV, or PDF.

        Note: the export format is read from the ``export_format`` query param.
        ``format`` is reserved by DRF content negotiation (URL_FORMAT_OVERRIDE)
        and must not be used here, or the request 404s before reaching this view.
        """
        # Manual permission check - allow authenticated users with analytics view permission
        if not request.user.is_authenticated:
            return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

        # Superuser/staff always have access
        if not (request.user.is_superuser or request.user.is_staff):
            # Check plugin permission for regular users (export-specific)
            if not self._has_plugin_permission(request.user, 'analytics', 'export'):
                return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        period = request.query_params.get('period', 'month')
        format_type = request.query_params.get('export_format', 'excel')
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        teams = request.query_params.getlist('teams')
        users = request.query_params.getlist('users')
        statuses = request.query_params.getlist('status')
        categories = request.query_params.getlist('category')

        # Audit trail: log the export request
        try:
            from plugins.audit_log.signals import log_action
            log_action(
                user=request.user,
                action='analytics_export',
                description=(
                    f'Analytics export: format={format_type}, period={period}'
                    f'{f", from={date_from}" if date_from else ""}'
                    f'{f", to={date_to}" if date_to else ""}'
                    f'{f", teams={teams}" if teams else ""}'
                    f'{f", users={users}" if users else ""}'
                ),
                new_values={
                    'format': format_type,
                    'period': period,
                    'date_from': date_from,
                    'date_to': date_to,
                    'teams': teams,
                    'users': users,
                    'statuses': statuses,
                    'categories': categories,
                },
                ip_address=get_client_ip(request),
                user_agent=request.META.get('HTTP_USER_AGENT', ''),
            )
        except Exception:
            pass  # Best-effort audit logging; don't block the export

        now = timezone.now()
        filename_base = f"analytics_report_{period}_{now.strftime('%Y%m%d')}"

        if format_type == 'excel':
            data = AnalyticsReportGenerator.generate_excel_report(period, date_from, date_to, teams, users, statuses, categories)
            response = HttpResponse(
                data,
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response['Content-Disposition'] = f'attachment; filename="{filename_base}.xlsx"'
            return response

        elif format_type == 'csv':
            data = AnalyticsReportGenerator.generate_csv_report(period, date_from, date_to, teams, users, statuses, categories)
            response = HttpResponse(data, content_type='text/csv')
            response['Content-Disposition'] = f'attachment; filename="{filename_base}.csv"'
            return response

        elif format_type == 'pdf':
            data = AnalyticsReportGenerator.generate_pdf_report(period, date_from, date_to, teams, users, statuses, categories)
            response = HttpResponse(data, content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="{filename_base}.pdf"'
            return response

        return Response({'error': 'Unsupported format'}, status=status.HTTP_400_BAD_REQUEST)

    def _can_access_job(self, user, job):
        """Check if user can access an export job (creator or staff/superuser)."""
        if not user.is_authenticated:
            return False
        if user.is_superuser or user.is_staff:
            return True
        return job.created_by_id == user.id

    @action(detail=False, methods=['get'], url_path='export-jobs')
    def list_export_jobs(self, request):
        """List the current user's export jobs (staff/superuser see all)."""
        queryset = ExportJob.objects.all()
        if not (request.user.is_superuser or request.user.is_staff):
            queryset = queryset.filter(created_by=request.user)
        queryset = queryset.order_by('-created_at')[:20]

        jobs = []
        for job in queryset:
            jobs.append({
                'job_id': job.id,
                'status': job.status,
                'format': job.report_format,
                'file_size_bytes': job.file_size_bytes,
                'error_message': job.error_message,
                'created_at': job.created_at.isoformat() if job.created_at else None,
                'completed_at': job.completed_at.isoformat() if job.completed_at else None,
            })
        return Response({'results': jobs})

    @action(detail=False, methods=['post'], url_path='export-jobs/create')
    def create_export_job(self, request):
        """
        Create a background export job. Returns the job ID immediately;
        the client polls /export-jobs/{id}/status/ until status='completed',
        then downloads via /export-jobs/{id}/download/.
        """
        if not request.user.is_authenticated:
            return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)
        if not (request.user.is_superuser or request.user.is_staff):
            if not self._has_plugin_permission(request.user, 'analytics', 'export'):
                return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        report_format = request.data.get('format', 'excel')
        if report_format not in ('excel', 'csv'):
            return Response({'error': 'Invalid format'}, status=status.HTTP_400_BAD_REQUEST)

        filter_params = {
            'period': request.data.get('period', 'month'),
            'date_from': request.data.get('date_from'),
            'date_to': request.data.get('date_to'),
            'teams': request.data.get('teams', []),
            'users': request.data.get('users', []),
            'statuses': request.data.get('statuses', []),
            'categories': request.data.get('categories', []),
        }

        job = ExportJob.objects.create(
            report_format=report_format,
            filter_params=filter_params,
            created_by=request.user,
        )

        # Defer thread start until the current transaction commits,
        # so the thread can see the job row. Falls back to immediate
        # start if no transaction is active (ATOMIC_REQUESTS off).
        ExportRunner.start_deferred(job.id)

        # Audit trail
        try:
            from plugins.audit_log.signals import log_action
            log_action(
                user=request.user,
                action='analytics_export_job_created',
                description=f'Background export job {job.id} created: format={report_format}',
                new_values={'job_id': job.id, 'format': report_format, 'filters': filter_params},
                ip_address=get_client_ip(request),
                user_agent=request.META.get('HTTP_USER_AGENT', ''),
            )
        except Exception:
            pass

        return Response({
            'job_id': job.id,
            'status': job.status,
            'format': job.report_format,
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path=r'export-jobs/(?P<job_id>\d+)/status')
    def export_job_status(self, request, job_id=None):
        """Poll the status of a background export job."""
        try:
            job = ExportJob.objects.get(id=job_id)
        except ExportJob.DoesNotExist:
            return Response({'error': 'Job not found'}, status=status.HTTP_404_NOT_FOUND)

        # Authorization: only the creator or staff/superuser can view status
        if not self._can_access_job(request.user, job):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        return Response({
            'job_id': job.id,
            'status': job.status,
            'format': job.report_format,
            'file_size_bytes': job.file_size_bytes,
            'error_message': job.error_message,
            'created_at': job.created_at.isoformat() if job.created_at else None,
            'completed_at': job.completed_at.isoformat() if job.completed_at else None,
        })

    @action(detail=False, methods=['get'], url_path=r'export-jobs/(?P<job_id>\d+)/download')
    def export_job_download(self, request, job_id=None):
        """Download the completed export file."""
        try:
            job = ExportJob.objects.get(id=job_id)
        except ExportJob.DoesNotExist:
            return Response({'error': 'Job not found'}, status=status.HTTP_404_NOT_FOUND)

        # Authorization: only the creator or staff/superuser can download
        if not self._can_access_job(request.user, job):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        if not job.is_ready:
            return Response({'error': 'File not ready'}, status=status.HTTP_409_CONFLICT)

        file_path = ExportRunner.get_file_path(job)
        if not file_path:
            return Response({'error': 'File not found on disk'}, status=status.HTTP_404_NOT_FOUND)

        ext = 'xlsx' if job.report_format == 'excel' else 'csv'
        filename = f"analytics_export_{job.id}.{ext}"

        return FileResponse(
            open(file_path, 'rb'),
            as_attachment=True,
            filename=filename,
        )


class AnalyticsConfigurationViewSet(PluginPermissionMixin, viewsets.ModelViewSet):
    """
    ViewSet for analytics configuration.
    Manages snapshot frequency, data retention, and metric collection settings.

    Access restricted to users with 'analytics.manage' permission.
    """
    plugin_name = 'analytics'
    queryset = AnalyticsConfiguration.objects.all()
    serializer_class = AnalyticsConfigurationSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def list(self, request, *args, **kwargs):  # noqa: F811 - distinct ViewSet class
        """Override list to return the current configuration instead of a list."""
        return self.current(request)

    @action(detail=False, methods=['get'])
    def current(self, request):
        """Get the current configuration or create default if none exists."""
        config = AnalyticsConfiguration.objects.first()
        if not config:
            config = AnalyticsConfiguration.objects.create()
        serializer = self.get_serializer(config)
        return Response(serializer.data)


class ScheduledReportViewSet(PluginPermissionMixin, viewsets.ModelViewSet):
    """
    ViewSet for scheduled reports.
    Allows users to schedule automatic report delivery via email.

    Create/update/delete requires 'analytics.manage' permission.
    List/retrieve requires 'analytics.view' permission.
    """
    plugin_name = 'analytics'
    queryset = ScheduledReport.objects.all()
    serializer_class = ScheduledReportSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ['schedule_type', 'is_active', 'report_format']
    ordering = ['-created_at']

    def _check_manage_permission(self, request):
        """Verify the user has analytics.manage permission."""
        if not request.user.is_authenticated:
            return False
        if request.user.is_superuser or request.user.is_staff:
            return True
        return self._has_plugin_permission(request.user, 'analytics', 'manage')

    def create(self, request, *args, **kwargs):
        if not self._check_manage_permission(request):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if not self._check_manage_permission(request):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if not self._check_manage_permission(request):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not self._check_manage_permission(request):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def run_now(self, request, pk=None):
        """Manually trigger a scheduled report execution — generates and sends the report."""
        if not self._check_manage_permission(request):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        report = self.get_object()

        if not report.recipients:
            return Response(
                {'error': 'No recipients configured for this report.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from django.core.mail import EmailMessage
            from django.conf import settings

            filter_preset = report.filter_preset or {}
            period = filter_preset.get('period', 'month')
            date_from = filter_preset.get('date_from')
            date_to = filter_preset.get('date_to')
            teams = filter_preset.get('teams', [])
            users = filter_preset.get('users', [])
            statuses = filter_preset.get('statuses', [])
            categories = filter_preset.get('categories', [])

            content_type = 'application/octet-stream'
            file_ext = 'bin'
            report_data = None

            if report.report_format == 'excel':
                report_data = AnalyticsReportGenerator.generate_excel_report(
                    period, date_from, date_to, teams, users, statuses, categories
                )
                content_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                file_ext = 'xlsx'
            elif report.report_format == 'csv':
                report_data = AnalyticsReportGenerator.generate_csv_report(
                    period, date_from, date_to, teams, users, statuses, categories
                )
                content_type = 'text/csv'
                file_ext = 'csv'

            if report_data:
                subject = f"Scheduled Analytics Report: {report.name}"
                body = f"Please find attached the scheduled analytics report: {report.name}\n\nDescription: {report.description}"

                email = EmailMessage(
                    subject, body,
                    settings.DEFAULT_FROM_EMAIL,
                    report.recipients,
                )
                filename = f"{report.name.replace(' ', '_')}_{timezone.now().strftime('%Y%m%d')}.{file_ext}"
                email.attach(filename, report_data, content_type)
                email.send()

            report.last_run_at = timezone.now()
            if report.schedule_type == 'daily':
                report.next_run_at = timezone.now() + timedelta(days=1)
            elif report.schedule_type == 'weekly':
                report.next_run_at = timezone.now() + timedelta(weeks=1)
            elif report.schedule_type == 'monthly':
                report.next_run_at = timezone.now() + timedelta(days=30)
            report.save()
            return Response({'detail': f'Report "{report.name}" sent successfully to {len(report.recipients)} recipient(s).'})
        except Exception as e:
            return Response({'error': f'Failed to send report: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ReportTemplateViewSet(PluginPermissionMixin, viewsets.ModelViewSet):
    """
    ViewSet for custom report templates.
    """
    plugin_name = 'analytics'
    queryset = ReportTemplate.objects.all()
    serializer_class = ReportTemplateSerializer
    permission_classes = [permissions.IsAuthenticated]
    ordering = ['name']
