"""
Reports app serializers.
"""

from rest_framework import serializers
from .models.core import ReportTemplate, GeneratedReport, AuditLog


class ReportTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportTemplate
        fields = ['id', 'name', 'report_type', 'description', 'configuration', 'is_active']


class GeneratedReportSerializer(serializers.ModelSerializer):
    generated_by_name = serializers.CharField(source='generated_by.username', read_only=True)
    report_type = serializers.CharField(source='template.report_type', read_only=True)
    
    class Meta:
        model = GeneratedReport
        fields = [
            'id', 'name', 'report_type', 'status',
            'date_range_start', 'date_range_end',
            'file_path', 'file_size', 'file_format',
            'generated_by', 'generated_by_name', 'created_at'
        ]


class AuditLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.username', read_only=True)
    action_display = serializers.CharField(source='get_action_display', read_only=True)
    model_name_display = serializers.CharField(source='get_model_name_display', read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            'id', 'user', 'user_name', 'action', 'action_display',
            'model_name', 'model_name_display', 'object_id', 'object_repr',
            'old_values', 'new_values', 'ip_address', 'timestamp',
            'changes_summary', 'extra_data'
        ]


class InsightsSerializer(serializers.Serializer):
    """Serializer for executive summary insights."""
    overtime_increase = serializers.FloatField(help_text="Percentage increase in overtime")
    leave_utilization = serializers.FloatField(help_text="Percentage of leave utilized")
    standby_coverage = serializers.FloatField(help_text="Percentage of standby coverage")


class TopTeamLeaderSerializer(serializers.Serializer):
    """Serializer for top team leaders ranking."""
    id = serializers.IntegerField()
    name = serializers.CharField()
    rank = serializers.IntegerField()
    total_hours = serializers.FloatField(help_text="Total approved hours (OT + Standby)")
    team_name = serializers.CharField(allow_null=True)
