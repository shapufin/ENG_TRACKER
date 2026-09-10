from rest_framework import viewsets, permissions, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from django.utils import timezone
from django.db.models import Count, Q
from datetime import timedelta

from .models import AuditLog, AuditLogFilter
from .serializers import AuditLogSerializer, AuditLogFilterSerializer, AuditLogSummarySerializer
from core.mixins.permissions import PluginPermissionMixin


class AuditLogViewSet(PluginPermissionMixin, viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for audit logs.
    Provides read-only access to audit trail data.
    """
    plugin_name = 'audit_log'
    queryset = AuditLog.objects.select_related('user', 'content_type')
    serializer_class = AuditLogSerializer
    permission_classes = [permissions.IsAuthenticated]
    permission_action_map = {'export': 'export'}
    pagination_class = PageNumberPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['description', 'user__username', 'user__email']
    ordering_fields = ['timestamp', 'action', 'user']
    ordering = ['-timestamp']

    def get_queryset(self):
        """Filter logs based on user permissions."""
        queryset = super().get_queryset()
        
        # Non-admin users can only see their own logs
        if not (self.request.user.is_staff or self.request.user.is_superuser):
            queryset = queryset.filter(user=self.request.user)
        
        # Filter by action if provided
        action_filter = self.request.query_params.get('action')
        if action_filter:
            queryset = queryset.filter(action=action_filter)
        
        # Filter by date range if provided
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        if start_date:
            queryset = queryset.filter(timestamp__gte=start_date)
        if end_date:
            queryset = queryset.filter(timestamp__lte=end_date)
        
        return queryset

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Get audit log summary statistics."""
        now = timezone.now()
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_ago = now - timedelta(days=7)
        month_ago = now - timedelta(days=30)

        queryset = self.get_queryset()
        
        total_logs = queryset.count()
        logs_today = queryset.filter(timestamp__gte=today).count()
        logs_this_week = queryset.filter(timestamp__gte=week_ago).count()
        logs_this_month = queryset.filter(timestamp__gte=month_ago).count()

        # Unique users
        unique_users = queryset.values('user').distinct().count()

        # Failed actions
        failed_actions = queryset.filter(status='failure').count()

        # Success rate
        success_rate = 0
        if total_logs > 0:
            success_actions = queryset.filter(status='success').count()
            success_rate = (success_actions / total_logs) * 100

        # Actions breakdown
        actions_breakdown = dict(
            queryset.values('action').annotate(count=Count('id')).values_list('action', 'count')
        )

        # Most active users
        most_active = queryset.values('user__username').annotate(
            count=Count('id')
        ).order_by('-count')[:5]
        most_active_users = [
            {'username': item['user__username'], 'count': item['count']}
            for item in most_active
        ]

        # Recent logs
        recent_logs = queryset[:10]

        data = {
            'total_logs': total_logs,
            'logs_today': logs_today,
            'logs_this_week': logs_this_week,
            'logs_this_month': logs_this_month,
            'unique_users': unique_users,
            'failed_actions': failed_actions,
            'success_rate': round(success_rate, 1),
            'actions_breakdown': actions_breakdown,
            'most_active_users': most_active_users,
            'recent_logs': recent_logs,
        }

        serializer = AuditLogSummarySerializer(data)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def export(self, request):
        """Export audit logs as CSV."""
        import csv
        from django.http import HttpResponse

        queryset = self.get_queryset()
        
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="audit_logs.csv"'
        
        writer = csv.writer(response)
        writer.writerow([
            'User', 'Action', 'Description', 'Object Type', 'Object ID',
            'IP Address', 'Status', 'Timestamp'
        ])
        
        for log in queryset:
            writer.writerow([
                log.user.username if log.user else 'Unknown',
                log.get_action_display(),
                log.description,
                log.content_type.model if log.content_type else '',
                log.object_id or '',
                log.ip_address or '',
                log.get_status_display(),
                log.timestamp.isoformat(),
            ])
        
        return response


class AuditLogFilterViewSet(PluginPermissionMixin, viewsets.ModelViewSet):
    """
    ViewSet for saved audit log filters.
    Allows users to save and manage filter presets.
    """
    plugin_name = 'audit_log'
    queryset = AuditLogFilter.objects.select_related('user', 'target_user')
    serializer_class = AuditLogFilterSerializer
    permission_classes = [permissions.IsAuthenticated]
    ordering_fields = ['created_at', 'name']
    ordering = ['-created_at']

    def get_queryset(self):
        """Return filters for current user or public filters."""
        return super().get_queryset().filter(
            Q(user=self.request.user) | Q(is_public=True)
        )

    def perform_create(self, serializer):
        """Set the user when creating a filter."""
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['post'])
    def apply(self, request, pk=None):
        """Apply a saved filter and return matching logs."""
        filter_obj = self.get_object()
        
        # Build query from filter
        logs = AuditLog.objects.all()
        
        if filter_obj.action:
            logs = logs.filter(action=filter_obj.action)
        if filter_obj.start_date:
            logs = logs.filter(timestamp__gte=filter_obj.start_date)
        if filter_obj.end_date:
            logs = logs.filter(timestamp__lte=filter_obj.end_date)
        if filter_obj.target_user:
            logs = logs.filter(user=filter_obj.target_user)
        
        # Restrict to user's own logs if not staff/superuser
        if not (request.user.is_staff or request.user.is_superuser):
            logs = logs.filter(user=request.user)
        
        serializer = AuditLogSerializer(logs, many=True)
        return Response(serializer.data)
