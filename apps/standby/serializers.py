from rest_framework import serializers
from apps.overtime.models import Client
from .models import StandbyLog, StandbyPattern


class StandbyPatternSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.get_full_name', read_only=True)
    recurrence_type_display = serializers.CharField(source='get_recurrence_type_display', read_only=True)

    class Meta:
        model = StandbyPattern
        fields = [
            'id',
            'user',
            'user_name',
            'name',
            'recurrence_type',
            'recurrence_type_display',
            'day_of_week',
            'start_time',
            'end_time',
            'valid_from',
            'valid_until',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class StandbyLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.get_full_name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    is_carried_over = serializers.SerializerMethodField()
    requested_period_label = serializers.SerializerMethodField()
    resolved_period_label = serializers.SerializerMethodField()
    pattern_name = serializers.CharField(source='pattern.name', read_only=True, allow_null=True)
    approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True, allow_null=True)
    client_ids = serializers.PrimaryKeyRelatedField(
        source='clients', many=True, read_only=True,
    )
    client_names = serializers.SerializerMethodField()

    class Meta:
        model = StandbyLog
        fields = [
            'id',
            'user',
            'user_name',
            'pattern',
            'pattern_name',
            'client_ids',
            'client_names',
            'date',
            'submitted_at',
            'requested_processing_period',
            'resolved_settlement_period',
            'approval_period_close',
            'is_carried_over', 'requested_period_label', 'resolved_period_label',
            'hours',
            'description',
            'start_time',
            'end_time',
            'evidence',
            'status',
            'status_display',
            'approved_by',
            'approved_by_name',
            'approved_at',
            'rejection_reason',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'created_at', 'updated_at', 'submitted_at', 'approved_at',
            'requested_processing_period', 'resolved_settlement_period',
            'approval_period_close', 'is_carried_over',
            'requested_period_label', 'resolved_period_label',
            'client_ids', 'client_names',
        ]

    def get_client_names(self, obj):
        return list(obj.clients.values_list('name', flat=True))

    def get_is_carried_over(self, obj) -> bool:
        return bool(
            obj.requested_processing_period
            and obj.requested_processing_period != obj.date.replace(day=1)
        )

    def get_requested_period_label(self, obj) -> str | None:
        return obj.requested_processing_period.strftime('%m/%Y') if obj.requested_processing_period else None

    def get_resolved_period_label(self, obj) -> str | None:
        return obj.resolved_settlement_period.strftime('%m/%Y') if obj.resolved_settlement_period else None


def _calculate_hours_from_times(start_time, end_time):
    """Calculate hours from a start/end time pair (handles overnight)."""
    from datetime import datetime, timedelta
    start = datetime.combine(datetime.today(), start_time)
    end = datetime.combine(datetime.today(), end_time)
    if end <= start:
        end += timedelta(days=1)
    diff_minutes = (end - start).total_seconds() / 60
    return int(diff_minutes // 60) + (1 if diff_minutes % 60 > 0 else 0)


class StandbyLogCreateSerializer(serializers.ModelSerializer):
    hours = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, allow_null=True
    )
    client_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=True,
    )

    class Meta:
        model = StandbyLog
        fields = [
            'pattern',
            'date',
            'hours',
            'description',
            'start_time',
            'end_time',
            'evidence',
            'client_ids',
        ]

    def validate_client_ids(self, ids):
        """Verify each ID corresponds to an existing Client."""
        if ids:
            existing = set(Client.objects.filter(pk__in=ids).values_list('pk', flat=True))
            missing = set(ids) - existing
            if missing:
                raise serializers.ValidationError(
                    f'Unknown client ID(s): {sorted(missing)}'
                )
        return ids

    def create(self, validated_data):
        # Pop client_ids — M2M can't be set via create(). The viewset
        # handles it via .clients.set() after save.
        validated_data.pop('client_ids', None)
        return super().create(validated_data)

    def validate(self, data):
        hours = data.get('hours')
        start_time = data.get('start_time')
        end_time = data.get('end_time')
        if hours is None:
            if start_time and end_time:
                hours = _calculate_hours_from_times(start_time, end_time)
            else:
                raise serializers.ValidationError(
                    {'hours': 'Hours are required when start/end times are not provided.'}
                )
        if hours <= 0:
            raise serializers.ValidationError({'hours': 'Hours must be greater than 0.'})
        if hours > 24:
            raise serializers.ValidationError({'hours': 'Hours cannot exceed 24 in a single day.'})
        data['hours'] = hours
        return data


class StandbyLogUpdateSerializer(serializers.ModelSerializer):
    hours = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, allow_null=True
    )
    client_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=True,
    )

    class Meta:
        model = StandbyLog
        fields = [
            'pattern',
            'date',
            'hours',
            'description',
            'start_time',
            'end_time',
            'evidence',
            'client_ids',
        ]

    def validate_client_ids(self, ids):
        """Verify each ID corresponds to an existing Client."""
        if ids:
            existing = set(Client.objects.filter(pk__in=ids).values_list('pk', flat=True))
            missing = set(ids) - existing
            if missing:
                raise serializers.ValidationError(
                    f'Unknown client ID(s): {sorted(missing)}'
                )
        return ids

    def update(self, instance, validated_data):
        validated_data.pop('client_ids', None)
        return super().update(instance, validated_data)

    def validate(self, data):
        hours = data.get('hours')
        start_time = data.get('start_time')
        end_time = data.get('end_time')
        if hours is None:
            if start_time and end_time:
                hours = _calculate_hours_from_times(start_time, end_time)
            else:
                raise serializers.ValidationError(
                    {'hours': 'Hours are required when start/end times are not provided.'}
                )
        if hours <= 0:
            raise serializers.ValidationError({'hours': 'Hours must be greater than 0.'})
        if hours > 24:
            raise serializers.ValidationError({'hours': 'Hours cannot exceed 24 in a single day.'})
        data['hours'] = hours
        return data


class StandbyLogApprovalSerializer(serializers.Serializer):
    rejection_reason = serializers.CharField(required=False, allow_blank=True)
