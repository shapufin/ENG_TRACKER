from rest_framework import serializers
from drf_spectacular.utils import extend_schema_serializer
from .models import AnalyticsSnapshot, AnalyticsMetric, AnalyticsConfiguration, ScheduledReport, ReportTemplate


class AnalyticsSnapshotSerializer(serializers.ModelSerializer):
    snapshot_type_display = serializers.CharField(source='get_snapshot_type_display', read_only=True)

    class Meta:
        model = AnalyticsSnapshot
        fields = [
            'id',
            'snapshot_type',
            'snapshot_type_display',
            'snapshot_date',
            'leave_approved_count',
            'leave_pending_count',
            'leave_rejected_count',
            'leave_total_days',
            'overtime_approved_hours',
            'overtime_pending_hours',
            'standby_scheduled_count',
            'standby_completed_count',
            'total_users',
            'active_users',
            'total_hours',
            'average_hours',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class AnalyticsMetricSerializer(serializers.ModelSerializer):
    metric_type_display = serializers.CharField(source='get_metric_type_display', read_only=True)
    user_name = serializers.CharField(source='user.get_full_name', read_only=True, allow_null=True)
    team_name = serializers.SerializerMethodField()

    def get_team_name(self, obj):
        return obj.team.name if obj.team_id else (obj.team_name or None)

    class Meta:
        model = AnalyticsMetric
        fields = [
            'id',
            'metric_type',
            'metric_type_display',
            'user',
            'user_name',
            'team',
            'team_name',
            'value',
            'label',
            'metadata',
            'recorded_at',
            'created_at',
        ]
        read_only_fields = ['recorded_at', 'created_at']


class AnalyticsSummarySerializer(serializers.Serializer):
    """Summary of analytics data for dashboard."""
    total_leave_requests = serializers.IntegerField()
    approved_leave_requests = serializers.IntegerField()
    pending_leave_requests = serializers.IntegerField()
    total_overtime_hours = serializers.DecimalField(max_digits=10, decimal_places=2)
    team_count = serializers.IntegerField()
    user_count = serializers.IntegerField()
    latest_snapshot = AnalyticsSnapshotSerializer(read_only=True)


class AnalyticsConfigurationSerializer(serializers.ModelSerializer):
    snapshot_frequency_display = serializers.CharField(source='get_snapshot_frequency_display', read_only=True)

    class Meta:
        model = AnalyticsConfiguration
        fields = [
            'id',
            'snapshot_frequency',
            'snapshot_frequency_display',
            'data_retention_days',
            'enabled_metrics',
            'auto_snapshot_enabled',
            'enable_threshold_alerts',
            'mtta_threshold_hours',
            'alert_recipients',
            'trend_threshold',
            'concentration_threshold',
            'spike_threshold',
            'backlog_threshold',
            'status_bottleneck_threshold',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class ScheduledReportSerializer(serializers.ModelSerializer):
    schedule_type_display = serializers.CharField(source='get_schedule_type_display', read_only=True)
    report_format_display = serializers.CharField(source='get_report_format_display', read_only=True)

    class Meta:
        model = ScheduledReport
        fields = [
            'id', 'name', 'description', 'schedule_type', 'schedule_type_display',
            'recipients', 'filter_preset', 'report_format', 'report_format_display',
            'is_active', 'last_run_at', 'next_run_at', 'created_at', 'updated_at'
        ]
        read_only_fields = ['last_run_at', 'next_run_at', 'created_at', 'updated_at']

    # A-01: recipients feed EmailMessage and filter_preset feeds the report
    # generator, so both are validated at the API boundary.
    LIST_FILTER_KEYS = ('teams', 'users', 'statuses', 'categories')
    SCALAR_FILTER_KEYS = ('period', 'date_from', 'date_to')

    def validate_recipients(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError('Recipients must be a list of email addresses.')
        from django.core.exceptions import ValidationError as DjangoValidationError
        from django.core.validators import validate_email
        for address in value:
            try:
                validate_email(address)
            except (DjangoValidationError, TypeError):
                raise serializers.ValidationError(f'Invalid email address: {address!r}')
        return value

    def validate_filter_preset(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError('Filter preset must be an object.')
        for key in self.LIST_FILTER_KEYS:
            if key in value and not isinstance(value[key], list):
                raise serializers.ValidationError(f'"{key}" must be a list.')
        for key in self.SCALAR_FILTER_KEYS:
            if value.get(key) is not None and not isinstance(value[key], str):
                raise serializers.ValidationError(f'"{key}" must be a string.')
        return value


@extend_schema_serializer(component_name='AnalyticsReportTemplate')
class ReportTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportTemplate
        fields = [
            'id', 'name', 'description', 'layout_config', 'column_selection',
            'chart_config', 'branding_config', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']
