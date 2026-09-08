"""Serializers for the Payroll plugin."""
from datetime import date

from django.db.models import Q
from rest_framework import serializers

from .models import (
    PayrollConfiguration,
    PayrollContributionRate,
    PayrollLine,
    PayrollOvertimeCategory,
    PayrollRuleSet,
    PayrollRun,
    PayrollTaxBracket,
    PayrollWorkCalendar,
    PayrollWorkday,
    WageAssignment,
)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

class PayrollConfigurationSerializer(serializers.ModelSerializer):
    class Meta:
        model = PayrollConfiguration
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


# ---------------------------------------------------------------------------
# Wage assignments
# ---------------------------------------------------------------------------

class WageAssignmentSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.username', read_only=True)
    user_full_name = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model = WageAssignment
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'created_by', 'updated_by']

    def get_user_full_name(self, obj):
        full = f'{obj.user.first_name} {obj.user.last_name}'.strip()
        return full or obj.user.username


class WageAssignmentCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = WageAssignment
        fields = ['user', 'gross_monthly_wage', 'effective_from', 'effective_to', 'note', 'is_active']

    def validate(self, data):
        effective_from = data.get('effective_from')
        effective_to = data.get('effective_to')
        if effective_to and effective_from and effective_to < effective_from:
            raise serializers.ValidationError({
                'effective_to': 'Effective to must be on or after effective from.',
            })
        wage = data.get('gross_monthly_wage')
        if wage is not None and wage < 0:
            raise serializers.ValidationError({
                'gross_monthly_wage': 'Wage cannot be negative.',
            })

        if data.get('is_active', getattr(self.instance, 'is_active', True)):
            user = data.get('user', getattr(self.instance, 'user', None))
            start = effective_from or getattr(self.instance, 'effective_from', None)
            end = effective_to or getattr(self.instance, 'effective_to', None)
            if user and start:
                overlap = WageAssignment.objects.filter(
                    user=user,
                    is_active=True,
                    effective_from__lte=end or date.max,
                ).filter(
                    Q(effective_to__isnull=True) | Q(effective_to__gte=start),
                )
                if self.instance:
                    overlap = overlap.exclude(pk=self.instance.pk)
                if overlap.exists():
                    raise serializers.ValidationError({
                        'effective_from': 'This wage period overlaps an active wage assignment.',
                    })
        return data


# ---------------------------------------------------------------------------
# Rule sets
# ---------------------------------------------------------------------------

class PayrollTaxBracketSerializer(serializers.ModelSerializer):
    class Meta:
        model = PayrollTaxBracket
        fields = '__all__'
        read_only_fields = ['id', 'rule_set']

    def validate(self, data):
        lower = data.get('lower_bound', getattr(self.instance, 'lower_bound', None))
        upper = data.get('upper_bound', getattr(self.instance, 'upper_bound', None))
        for field in ('lower_bound', 'upper_bound', 'rate', 'fixed_amount'):
            value = data.get(field)
            if value is not None and value < 0:
                raise serializers.ValidationError({field: 'Value cannot be negative.'})
        if lower is not None and upper is not None and upper <= lower:
            raise serializers.ValidationError({'upper_bound': 'Upper bound must be greater than lower bound.'})
        return data


class PayrollContributionRateSerializer(serializers.ModelSerializer):
    class Meta:
        model = PayrollContributionRate
        fields = '__all__'
        read_only_fields = ['id', 'rule_set']

    def validate(self, data):
        rule_set = self.context.get('rule_set')
        contribution_type = data.get('contribution_type', getattr(self.instance, 'contribution_type', None))
        side = data.get('side', getattr(self.instance, 'side', None))
        if rule_set and PayrollContributionRate.objects.filter(
            rule_set=rule_set, contribution_type=contribution_type, side=side,
        ).exclude(pk=getattr(self.instance, 'pk', None)).exists():
            raise serializers.ValidationError('Contribution type and side must be unique within the rule set.')
        for field in ('rate', 'cap', 'floor'):
            value = data.get(field)
            if value is not None and value < 0:
                raise serializers.ValidationError({field: 'Value cannot be negative.'})
        cap = data.get('cap', getattr(self.instance, 'cap', None))
        floor = data.get('floor', getattr(self.instance, 'floor', None))
        if cap is not None and floor is not None and cap < floor:
            raise serializers.ValidationError({'cap': 'Cap must be greater than or equal to floor.'})
        return data


class PayrollOvertimeCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = PayrollOvertimeCategory
        fields = '__all__'
        read_only_fields = ['id', 'rule_set']

    def validate_code(self, value):
        rule_set = self.context.get('rule_set')
        duplicate = PayrollOvertimeCategory.objects.filter(
            rule_set=rule_set, code=value,
        ).exclude(pk=getattr(self.instance, 'pk', None))
        if rule_set and duplicate.exists():
            raise serializers.ValidationError('Overtime code must be unique within the rule set.')
        return value

    def validate(self, data):
        multiplier = data.get('multiplier')
        if multiplier is not None and multiplier < 0:
            raise serializers.ValidationError({'multiplier': 'Multiplier cannot be negative.'})
        for field in ('night_start_hour', 'night_end_hour'):
            value = data.get(field)
            if value is not None and not 0 <= value <= 23:
                raise serializers.ValidationError({field: 'Hour must be between 0 and 23.'})
        return data


class PayrollRuleSetSerializer(serializers.ModelSerializer):
    tax_brackets = PayrollTaxBracketSerializer(many=True, read_only=True)
    contribution_rates = PayrollContributionRateSerializer(many=True, read_only=True)
    overtime_categories = PayrollOvertimeCategorySerializer(many=True, read_only=True)
    has_payroll_runs = serializers.SerializerMethodField()
    effective_status = serializers.SerializerMethodField()

    class Meta:
        model = PayrollRuleSet
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'has_payroll_runs', 'effective_status']

    def get_has_payroll_runs(self, obj):
        annotated = getattr(obj, 'has_payroll_runs', None)
        return annotated if annotated is not None else obj.runs.exists()

    def get_effective_status(self, obj):
        """One of: current, upcoming, superseded, inactive.

        Computed in ``PayrollRuleSetViewSet.get_queryset`` via annotation
        (mirrors ``PayrollRuleSet.resolve_for_date`` for today). Falls back
        to a Python computation when the annotation is absent (e.g. single
        object retrieve without the list annotation, or shell usage).
        """
        annotated = getattr(obj, 'effective_status', None)
        if annotated:
            return annotated
        today = date.today()
        if not obj.is_active:
            return 'inactive'
        if obj.effective_from > today:
            return 'upcoming'
        covers_today = obj.effective_to is None or obj.effective_to >= today
        if not covers_today:
            return 'superseded'
        newer = PayrollRuleSet.objects.filter(
            is_active=True,
            tax_profile=obj.tax_profile,
            effective_from__gt=obj.effective_from,
            effective_from__lte=today,
        ).filter(
            Q(effective_to__isnull=True) | Q(effective_to__gte=today),
        ).exists()
        return 'current' if not newer else 'superseded'


class PayrollRuleSetCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = PayrollRuleSet
        fields = ['code', 'name', 'version', 'country', 'effective_from',
                  'effective_to', 'is_active', 'tax_profile', 'source', 'notes',
                  'validation_status']
        validators = []

    def validate(self, data):
        if self.instance is not None and self.instance.runs.exists():
            raise serializers.ValidationError(
                'This rule set is referenced by a payroll run and is immutable. '
                'Create a new rule-set version instead.'
            )
        effective_from = data.get('effective_from', getattr(self.instance, 'effective_from', None))
        effective_to = data.get('effective_to', getattr(self.instance, 'effective_to', None))
        if effective_to is not None and effective_from is not None and effective_to < effective_from:
            raise serializers.ValidationError({'effective_to': 'Effective to must be on or after effective from.'})
        is_active = data.get('is_active', getattr(self.instance, 'is_active', True))
        country = data.get('country', getattr(self.instance, 'country', 'AL'))
        tax_profile = data.get('tax_profile', getattr(self.instance, 'tax_profile', 'standard'))
        if is_active and PayrollRuleSet.has_active_effective_date_conflict(
            country, tax_profile, effective_from,
            exclude_pk=getattr(self.instance, 'pk', None),
        ):
            raise serializers.ValidationError({
                'effective_from': 'Another active rule set already uses this effective date for the same country and tax profile.',
            })
        return data


class PayrollTaxBracketWriteSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)

    class Meta:
        model = PayrollTaxBracket
        fields = ['id', 'lower_bound', 'upper_bound', 'rate', 'fixed_amount', 'order']

    def validate(self, data):
        lower = data.get('lower_bound')
        upper = data.get('upper_bound')
        for field in ('lower_bound', 'upper_bound', 'rate', 'fixed_amount'):
            value = data.get(field)
            if value is not None and value < 0:
                raise serializers.ValidationError({field: 'Value cannot be negative.'})
        if lower is not None and upper is not None and upper <= lower:
            raise serializers.ValidationError({'upper_bound': 'Upper bound must be greater than lower bound.'})
        if data.get('rate') is not None and data['rate'] > 1:
            raise serializers.ValidationError({'rate': 'Tax rate cannot exceed 100%.'})
        return data


class PayrollContributionRateWriteSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)

    class Meta:
        model = PayrollContributionRate
        fields = ['id', 'contribution_type', 'side', 'rate', 'cap', 'floor']

    def validate(self, data):
        for field in ('rate', 'cap', 'floor'):
            value = data.get(field)
            if value is not None and value < 0:
                raise serializers.ValidationError({field: 'Value cannot be negative.'})
        cap = data.get('cap')
        floor = data.get('floor')
        if cap is not None and floor is not None and cap < floor:
            raise serializers.ValidationError({'cap': 'Cap must be greater than or equal to floor.'})
        if data.get('rate') is not None and data['rate'] > 1:
            raise serializers.ValidationError({'rate': 'Contribution rate cannot exceed 100%.'})
        return data


class PayrollOvertimeCategoryWriteSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)

    class Meta:
        model = PayrollOvertimeCategory
        fields = [
            'id', 'code', 'multiplier', 'night_start_hour', 'night_end_hour',
            'applies_weekend', 'applies_holiday', 'order',
        ]

    def validate(self, data):
        multiplier = data.get('multiplier')
        if multiplier is not None and multiplier < 0:
            raise serializers.ValidationError({'multiplier': 'Multiplier cannot be negative.'})
        for field in ('night_start_hour', 'night_end_hour'):
            value = data.get(field)
            if value is not None and not 0 <= value <= 23:
                raise serializers.ValidationError({field: 'Hour must be between 0 and 23.'})
        return data


class PayrollRuleSetAtomicSaveSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=['edit', 'version'], default='edit')
    expected_updated_at = serializers.DateTimeField(required=False)
    parent_fields = serializers.DictField()
    tax_brackets = PayrollTaxBracketWriteSerializer(many=True)
    contribution_rates = PayrollContributionRateWriteSerializer(many=True)
    overtime_categories = PayrollOvertimeCategoryWriteSerializer(many=True)

    def validate(self, data):
        if data['mode'] == 'version':
            child_groups = (
                data['tax_brackets'], data['contribution_rates'], data['overtime_categories'],
            )
            if any('id' in child for group in child_groups for child in group):
                raise serializers.ValidationError({
                    'detail': 'Child IDs must be omitted when creating a new rule-set version.',
                })
        return data


class PayrollRuleSetCloneSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=50)
    version = serializers.CharField(max_length=20)
    effective_from = serializers.DateField()
    name = serializers.CharField(max_length=200, required=False)
    effective_to = serializers.DateField(required=False, allow_null=True)
    is_active = serializers.BooleanField(required=False)
    tax_profile = serializers.ChoiceField(
        choices=PayrollRuleSet.TAX_PROFILE_CHOICES, required=False,
    )
    source = serializers.CharField(max_length=200, required=False)
    notes = serializers.CharField(required=False, allow_blank=True)
    validation_status = serializers.CharField(max_length=30, required=False)

    def validate_code(self, value):
        if PayrollRuleSet.objects.filter(code=value).exists():
            raise serializers.ValidationError('A rule set with this code already exists.')
        return value

    def validate(self, data):
        if data.get('effective_to') and data['effective_to'] < data['effective_from']:
            raise serializers.ValidationError({'effective_to': 'Effective to must be on or after effective from.'})
        return data


# ---------------------------------------------------------------------------
# Work calendar
# ---------------------------------------------------------------------------

class PayrollWorkdaySerializer(serializers.ModelSerializer):
    class Meta:
        model = PayrollWorkday
        fields = '__all__'


class PayrollWorkCalendarSerializer(serializers.ModelSerializer):
    workdays = PayrollWorkdaySerializer(many=True, read_only=True)
    workday_count = serializers.SerializerMethodField()
    working_day_count = serializers.SerializerMethodField()

    class Meta:
        model = PayrollWorkCalendar
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']

    def get_workday_count(self, obj):
        return obj.workdays.count()

    def get_working_day_count(self, obj):
        return obj.workdays.filter(is_working_day=True).count()


# ---------------------------------------------------------------------------
# Payroll runs and lines
# ---------------------------------------------------------------------------

class PayrollLineSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.username', read_only=True)
    user_full_name = serializers.SerializerMethodField()

    class Meta:
        model = PayrollLine
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'run', 'wage_assignment',
                            'gross_monthly_wage', 'monthly_working_days',
                            'monthly_standard_hours', 'overtime_hours',
                            'overtime_amount', 'standby_hours', 'standby_amount',
                            'total_gross', 'taxable_base', 'contribution_base',
                            'employee_social', 'employee_health', 'income_tax',
                            'total_employee_deductions', 'net_pay',
                            'employer_social', 'employer_health',
                            'total_employer_cost', 'overtime_breakdown', 'carryover_breakdown',
                            'calculation_trace', 'warnings', 'rule_set_version']

    def get_user_full_name(self, obj):
        full = f'{obj.user.first_name} {obj.user.last_name}'.strip()
        return full or obj.user.username


class PayrollRunSerializer(serializers.ModelSerializer):
    line_count = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    finalized_by_name = serializers.CharField(source='finalized_by.username', read_only=True)
    rule_set_name = serializers.CharField(source='rule_set.name', read_only=True)

    class Meta:
        model = PayrollRun
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'created_by', 'finalized_by',
                            'finalized_at', 'rule_set', 'configuration_snapshot',
                            'totals', 'status']

    def get_line_count(self, obj):
        return obj.lines.count()


class PayrollRunCreateSerializer(serializers.Serializer):
    year = serializers.IntegerField(min_value=2020, max_value=2100)
    month = serializers.IntegerField(min_value=1, max_value=12)
    user_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False, default=list,
        help_text='Optional list of user IDs. If empty, all active users with wages.',
    )
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class PayrollRunGenerateSerializer(serializers.Serializer):
    user_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False, default=list,
        help_text='Optional list of user IDs to include. If empty, uses all active users with wages.',
    )
