"""
Leave management app serializers.
"""

from rest_framework import serializers
from .models import LeaveBalance, LeaveRequest, GlobalSettings, count_request_days


class GlobalSettingsSerializer(serializers.ModelSerializer):
    """Serializer for GlobalSettings singleton."""

    class Meta:
        model = GlobalSettings
        fields = [
            'id', 'default_yearly_leave_days',
            'carry_over_expiry_month', 'carry_over_expiry_day',
            'carry_over_enabled', 'carry_over_applied_year',
            'business_timezone', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'carry_over_applied_year', 'created_at', 'updated_at']

    def validate(self, attrs):
        month = attrs.get('carry_over_expiry_month', self.instance.carry_over_expiry_month if self.instance else None)
        day = attrs.get('carry_over_expiry_day', self.instance.carry_over_expiry_day if self.instance else None)
        yearly_days = attrs.get('default_yearly_leave_days', self.instance.default_yearly_leave_days if self.instance else None)

        if yearly_days is not None and (yearly_days < 0 or yearly_days > 365):
            raise serializers.ValidationError(
                {'default_yearly_leave_days': 'Default yearly vacation days must be between 0 and 365.'}
            )

        if month is not None:
            if month < 1 or month > 12:
                raise serializers.ValidationError(
                    {'carry_over_expiry_month': 'Expiry month must be between 1 and 12.'}
                )

        if day is not None:
            if day < 1 or day > 31:
                raise serializers.ValidationError(
                    {'carry_over_expiry_day': 'Expiry day must be between 1 and 31.'}
                )

        if month is not None and day is not None:
            import calendar
            max_day = calendar.monthrange(2000, month)[1]  # 2000 is a leap year
            if day > max_day:
                raise serializers.ValidationError(
                    {'carry_over_expiry_day': f'Day {day} does not exist in month {month}.'}
                )
        return attrs


class LeaveBalanceSerializer(serializers.ModelSerializer):
    """Serializer for LeaveBalance model."""
    user_name = serializers.CharField(source='user.username', read_only=True)
    available_days = serializers.DecimalField(max_digits=5, decimal_places=1, read_only=True)
    effective_available_days = serializers.DecimalField(
        source='get_effective_available_days',
        max_digits=5, decimal_places=1, read_only=True
    )

    class Meta:
        model = LeaveBalance
        fields = [
            'id', 'user', 'user_name', 'leave_type', 'year',
            'total_days', 'used_days', 'pending_days', 'available_days',
            'effective_available_days', 'is_carry_over', 'expires_at',
            'accrual_start_date',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class LeaveBalanceDetailSerializer(serializers.Serializer):
    """Serializer for carry-over/current-year balance fragments."""

    id = serializers.IntegerField()
    total_days = serializers.FloatField()
    used_days = serializers.FloatField()
    pending_days = serializers.FloatField()
    available_days = serializers.FloatField()
    effective_available_days = serializers.FloatField()
    expires_at = serializers.DateField(allow_null=True, required=False)
    is_expired = serializers.BooleanField(required=False)
    accrual_start_date = serializers.DateField(allow_null=True, required=False)
    monthly_accrued_days = serializers.FloatField(required=False)


class LeaveBalanceTypeSummarySerializer(serializers.Serializer):
    """Serializer for aggregations per leave type (vacation)."""

    carry_over = LeaveBalanceDetailSerializer(allow_null=True, required=False)
    current_year = LeaveBalanceDetailSerializer(allow_null=True, required=False)
    total_available = serializers.FloatField()
    total_used = serializers.FloatField()
    total_pending = serializers.FloatField()


class LeaveBalanceSummarySerializer(serializers.Serializer):
    """Serializer for user balance summary response."""

    user_id = serializers.IntegerField()
    username = serializers.CharField()
    full_name = serializers.CharField()
    year = serializers.IntegerField()
    vacation = LeaveBalanceTypeSummarySerializer()


class LeaveRequestSerializer(serializers.ModelSerializer):
    """Serializer for LeaveRequest model."""
    user_name = serializers.CharField(source='user.username', read_only=True)
    user_full_name = serializers.SerializerMethodField()
    request_type_display = serializers.CharField(source='get_request_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.username', read_only=True)
    days_requested = serializers.IntegerField(read_only=True)
    team_id = serializers.SerializerMethodField()
    team_name = serializers.SerializerMethodField()
    
    balance_id = serializers.IntegerField(source='balance.id', read_only=True, allow_null=True)
    user_leave_balance = serializers.SerializerMethodField()

    class Meta:
        model = LeaveRequest
        fields = [
            'id', 'user', 'user_name', 'user_full_name',
            'team_id', 'team_name',
            'request_type', 'request_type_display',
            'start_date', 'end_date', 'days_requested',
            'reason',
            'status', 'status_display',
            'approved_by', 'approved_by_name', 'approved_at', 'rejection_reason',
            'balance_id', 'user_leave_balance',
            'submitted_at', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'created_at', 'updated_at',
            'approved_by', 'approved_at', 'submitted_at'
        ]
    
    def get_user_full_name(self, obj) -> str:
        return f"{obj.user.first_name} {obj.user.last_name}".strip() or obj.user.username

    def get_user_leave_balance(self, obj) -> float:
        from django.utils import timezone
        current_year = timezone.now().year
        target_type = getattr(obj, 'request_type', 'vacation') or 'vacation'
        prefetched = getattr(obj.user, 'prefetched_leave_balances', None)
        if prefetched is None:
            from .models import LeaveBalance
            balances = LeaveBalance.objects.filter(
                user=obj.user,
                year=current_year,
                leave_type=target_type
            )
        else:
            balances = [
                balance for balance in prefetched
                if balance.year == current_year and balance.leave_type == target_type
            ]
        total = sum(b.get_effective_available_days() for b in balances)
        return float(total)

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


class LeaveRequestCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating LeaveRequest.
    User field is excluded and set by viewset after validation."""

    class Meta:
        model = LeaveRequest
        exclude = ['user', 'approved_by', 'approved_at', 'rejection_reason', 'balance', 'submitted_at']

    def validate(self, data):
        if data['end_date'] < data['start_date']:
            raise serializers.ValidationError("End date must be after start date.")
        request_type = data.get('request_type', 'vacation')
        if count_request_days(request_type, data['start_date'], data['end_date']) == 0:
            raise serializers.ValidationError("Leave must include at least one business day.")

        # Balance check will be done in viewset after user is injected
        return data
