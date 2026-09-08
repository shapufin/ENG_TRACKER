"""
Overtime app serializers.
"""

from rest_framework import serializers
from .models import Client, OvertimeLog
from .models.core import clean_ticket_references


class ClientSerializer(serializers.ModelSerializer):
    """Serializer for Client model."""
    
    class Meta:
        model = Client
        fields = ['id', 'name', 'code', 'description', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']


class OvertimeLogSerializer(serializers.ModelSerializer):
    """
    Serializer for OvertimeLog model.
    
    Includes nested user and client information.
    """
    user_name = serializers.CharField(source='user.username', read_only=True)
    user_full_name = serializers.SerializerMethodField()
    client_name = serializers.CharField(source='client.name', read_only=True)
    client_code = serializers.CharField(source='client.code', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.username', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    is_carried_over = serializers.SerializerMethodField()
    requested_period_label = serializers.SerializerMethodField()
    resolved_period_label = serializers.SerializerMethodField()
    hours = serializers.SerializerMethodField()  # Round hours for display
    team_id = serializers.SerializerMethodField()
    team_name = serializers.SerializerMethodField()
    
    class Meta:
        model = OvertimeLog
        fields = [
            'id', 'user', 'user_name', 'user_full_name',
            'team_id', 'team_name',
            'client', 'client_name', 'client_code',
            'date', 'submitted_at', 'requested_processing_period',
            'resolved_settlement_period', 'approval_period_close',
            'is_carried_over', 'requested_period_label', 'resolved_period_label',
            'start_time', 'end_time', 'hours',
            'description', 'evidence_type', 'evidence', 'ticket_references', 'reference_code',
            'status', 'status_display',
            'approved_by', 'approved_by_name', 'approved_at', 'rejection_reason',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'created_at', 'updated_at', 'submitted_at',
            'user', 'approved_by', 'approved_at',
            'requested_processing_period', 'resolved_settlement_period',
            'approval_period_close', 'is_carried_over',
            'requested_period_label', 'resolved_period_label',
        ]
    
    def validate_ticket_references(self, value):
        return clean_ticket_references(value)

    def get_user_full_name(self, obj) -> str:
        """Return user's full name."""
        return f"{obj.user.first_name} {obj.user.last_name}".strip() or obj.user.username
    
    def get_is_carried_over(self, obj) -> bool:
        return bool(
            obj.requested_processing_period
            and obj.requested_processing_period != obj.date.replace(day=1)
        )

    def get_requested_period_label(self, obj) -> str | None:
        return obj.requested_processing_period.strftime('%m/%Y') if obj.requested_processing_period else None

    def get_resolved_period_label(self, obj) -> str | None:
        return obj.resolved_settlement_period.strftime('%m/%Y') if obj.resolved_settlement_period else None

    def get_hours(self, obj) -> int:
        """Round hours for display."""
        return int(obj.hours) if obj.hours else 0

    def get_team_id(self, obj) -> int | None:
        """Get user's primary team ID."""
        if hasattr(obj.user, 'profile') and obj.user.profile.get_primary_team():
            return obj.user.profile.get_primary_team().id
        return None

    def get_team_name(self, obj) -> str | None:
        """Get user's primary team name."""
        if hasattr(obj.user, 'profile') and obj.user.profile.get_primary_team():
            return obj.user.profile.get_primary_team().name
        return None


class OvertimeLogCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating OvertimeLog entries.

    Accepts start_time/end_time and calculates hours automatically.
    User field is excluded and set by viewset after validation.
    """

    class Meta:
        model = OvertimeLog
        exclude = [
            'user', 'submitted_at', 'requested_processing_period',
            'approval_period_close', 'resolved_settlement_period',
            'approved_by', 'approved_at', 'rejection_reason',
        ]
        extra_kwargs = {
            'hours': {'required': False},
            'evidence_type': {'required': False},
            'description': {'required': False},
            'evidence': {'required': False},
            'reference_code': {'required': False},
            'ticket_references': {'required': False, 'default': list},
        }

    def validate_ticket_references(self, value):
        return clean_ticket_references(value)

    def validate(self, data):
        data = super().validate(data)
        start_time = data.get('start_time')
        end_time = data.get('end_time')
        hours = data.get('hours')

        # Validate that both times are provided together
        if (start_time and not end_time) or (end_time and not start_time):
            raise serializers.ValidationError({
                'start_time': 'Both start_time and end_time must be provided together.',
                'end_time': 'Both start_time and end_time must be provided together.'
            })

        if start_time and end_time:
            from datetime import datetime, timedelta
            today = datetime.today()
            start_dt = datetime.combine(today, start_time)
            end_dt = datetime.combine(today, end_time)
            if end_dt <= start_dt:
                end_dt += timedelta(days=1)
            diff = end_dt - start_dt
            total_minutes = diff.total_seconds() / 60
            calculated_hours = int(total_minutes // 60) + (1 if total_minutes % 60 > 0 else 0)
            if calculated_hours > 24:
                raise serializers.ValidationError({'hours': 'Hours cannot exceed 24.'})
            data['hours'] = calculated_hours
        elif hours is None:
            raise serializers.ValidationError(
                'Provide either hours OR both start_time and end_time.'
            )
        else:
            if hours <= 0:
                raise serializers.ValidationError({'hours': 'Hours must be greater than 0.'})
            if hours > 24:
                raise serializers.ValidationError({'hours': 'Hours cannot exceed 24 in a single day.'})
        return data


class OvertimeApprovalSerializer(serializers.ModelSerializer):
    """
    Serializer for approving/rejecting overtime entries.
    """
    rejection_reason = serializers.CharField(required=False, allow_blank=True)
    
    class Meta:
        model = OvertimeLog
        fields = ['status', 'rejection_reason']
    
    def validate(self, data):
        """Validate approval data."""
        if data.get('status') == 'rejected' and not data.get('rejection_reason'):
            raise serializers.ValidationError(
                "Rejection reason is required when rejecting an entry."
            )
        return data


class OvertimeSummarySerializer(serializers.Serializer):
    """
    Serializer for overtime summary statistics.
    """
    total_hours = serializers.DecimalField(max_digits=10, decimal_places=2)
    total_entries = serializers.IntegerField()
    approved_hours = serializers.DecimalField(max_digits=10, decimal_places=2)
    pending_hours = serializers.DecimalField(max_digits=10, decimal_places=2)
    rejected_hours = serializers.DecimalField(max_digits=10, decimal_places=2)
