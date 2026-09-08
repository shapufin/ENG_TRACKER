from rest_framework import serializers
from drf_spectacular.utils import extend_schema_serializer
from .models import AuditLog, AuditLogFilter


@extend_schema_serializer(component_name='PluginAuditLog')
class AuditLogSerializer(serializers.ModelSerializer):
    action_display = serializers.CharField(source='get_action_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    user_name = serializers.CharField(source='user.get_full_name', read_only=True, allow_null=True)
    content_type_name = serializers.CharField(source='content_type.model', read_only=True, allow_null=True)

    class Meta:
        model = AuditLog
        fields = [
            'id',
            'user',
            'user_name',
            'action',
            'action_display',
            'description',
            'content_type',
            'content_type_name',
            'object_id',
            'old_values',
            'new_values',
            'ip_address',
            'user_agent',
            'status',
            'status_display',
            'timestamp',
            'created_at',
        ]
        read_only_fields = ['timestamp', 'created_at']


class AuditLogFilterSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.get_full_name', read_only=True)
    target_user_name = serializers.CharField(source='target_user.get_full_name', read_only=True, allow_null=True)

    class Meta:
        model = AuditLogFilter
        fields = [
            'id',
            'user',
            'user_name',
            'name',
            'description',
            'action',
            'start_date',
            'end_date',
            'target_user',
            'target_user_name',
            'is_public',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class AuditLogSummarySerializer(serializers.Serializer):
    """Summary of audit log statistics."""
    total_logs = serializers.IntegerField()
    logs_today = serializers.IntegerField()
    logs_this_week = serializers.IntegerField()
    logs_this_month = serializers.IntegerField()
    unique_users = serializers.IntegerField()
    failed_actions = serializers.IntegerField()
    success_rate = serializers.FloatField()
    actions_breakdown = serializers.DictField()
    most_active_users = serializers.ListField()
    recent_logs = AuditLogSerializer(many=True, read_only=True)
