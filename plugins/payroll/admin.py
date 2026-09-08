from django.contrib import admin
from django.core.exceptions import ValidationError
from django.db import models
from core.mixins.permissions import SuperuserOnlyAdminMixin

from .models import (
    PayrollConfiguration,
    PayrollContributionRate,
    PayrollLine,
    PayrollOvertimeCategory,
    PayrollRuleSet,
    PayrollRun,
    PayrollRunEntry,
    PayrollTaxBracket,
    PayrollWorkCalendar,
    PayrollWorkday,
    WageAssignment,
)


def _validate_rule_set_children(rule_set):
    """Backend contiguity/structure check shared with the API layer."""
    brackets = list(rule_set.tax_brackets.order_by('lower_bound', 'order', 'pk'))
    if not brackets:
        return
    if brackets[0].lower_bound != 0:
        raise ValidationError('Tax brackets must start at zero.')
    open_ended = [b for b in brackets if b.upper_bound is None]
    if len(open_ended) != 1 or open_ended[0] != brackets[-1]:
        raise ValidationError('Exactly one open-ended bracket must be last.')
    for prev, curr in zip(brackets, brackets[1:]):
        if prev.upper_bound != curr.lower_bound:
            raise ValidationError('Tax brackets must be ordered, contiguous, and gap-free.')


class PayrollTaxBracketInline(SuperuserOnlyAdminMixin, admin.TabularInline):
    model = PayrollTaxBracket
    extra = 0

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.select_related('rule_set')


class PayrollContributionRateInline(SuperuserOnlyAdminMixin, admin.TabularInline):
    model = PayrollContributionRate
    extra = 0

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.select_related('rule_set')


class PayrollOvertimeCategoryInline(SuperuserOnlyAdminMixin, admin.TabularInline):
    model = PayrollOvertimeCategory
    extra = 0

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.select_related('rule_set')


@admin.register(PayrollConfiguration)
class PayrollConfigurationAdmin(SuperuserOnlyAdminMixin, admin.ModelAdmin):
    list_display = ['currency', 'country', 'weekday_standby_hourly_rate', 'weekend_standby_hourly_rate', 'updated_at']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(WageAssignment)
class WageAssignmentAdmin(SuperuserOnlyAdminMixin, admin.ModelAdmin):
    list_display = ['user', 'gross_monthly_wage', 'effective_from', 'effective_to', 'is_active', 'updated_at']
    list_filter = ['is_active', 'effective_from']
    search_fields = ['user__username', 'user__email', 'user__first_name', 'user__last_name']
    autocomplete_fields = ['user', 'created_by', 'updated_by']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(PayrollRuleSet)
class PayrollRuleSetAdmin(SuperuserOnlyAdminMixin, admin.ModelAdmin):
    list_display = ['name', 'code', 'version', 'effective_from', 'effective_to', 'is_active', 'validation_status']
    list_filter = ['is_active', 'tax_profile', 'validation_status']
    search_fields = ['name', 'code', 'source']
    readonly_fields = ['created_at', 'updated_at']
    inlines = [PayrollTaxBracketInline, PayrollContributionRateInline, PayrollOvertimeCategoryInline]

    def _ensure_mutable(self, obj):
        if obj is not None and obj.runs.exists():
            raise ValidationError(
                'This rule set is referenced by a payroll run and is immutable. '
                'Create a new version instead.'
            )

    def save_model(self, request, obj, form, change):
        if change:
            self._ensure_mutable(obj)
        super().save_model(request, obj, form, change)

    def delete_model(self, request, obj):
        self._ensure_mutable(obj)
        super().delete_model(request, obj)

    def delete_queryset(self, request, queryset):
        """Block bulk deletion of rule sets referenced by payroll runs."""
        referenced = queryset.filter(runs__isnull=False).distinct()
        if referenced.exists():
            raise ValidationError(
                'Cannot bulk delete: one or more selected rule sets are '
                'referenced by payroll runs and are immutable.'
            )
        super().delete_queryset(request, queryset)

    def get_actions(self, request):
        actions = super().get_actions(request)
        qs = self.get_queryset(request)
        if qs.exists() and not qs.exclude(runs__isnull=False).distinct().exists():
            actions.pop('delete_selected', None)
        return actions

    def save_formset(self, request, form, formset, change):
        """Validate rule-set children after inline edits and block mutations
        on rule sets that are already referenced by a payroll run."""
        rule_set = form.instance
        if rule_set.pk and rule_set.runs.exists():
            # Allow no child mutations once a run references the rule set.
            if any(formset.changed_objects) or any(formset.new_objects) or any(formset.deleted_objects):
                raise ValidationError(
                    'This rule set is referenced by a payroll run and its '
                    'tax brackets, contribution rates, and overtime '
                    'categories are immutable. Create a new version instead.'
                )
        super().save_formset(request, form, formset, change)
        if rule_set.pk:
            _validate_rule_set_children(rule_set)


@admin.register(PayrollWorkCalendar)
class PayrollWorkCalendarAdmin(SuperuserOnlyAdminMixin, admin.ModelAdmin):
    list_display = ['country', 'year', 'is_active', 'source', 'updated_at']
    list_filter = ['country', 'is_active']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(PayrollWorkday)
class PayrollWorkdayAdmin(SuperuserOnlyAdminMixin, admin.ModelAdmin):
    list_display = ['date', 'is_working_day', 'is_holiday', 'holiday_name', 'standard_hours']
    list_filter = ['is_working_day', 'is_holiday', 'calendar__year']
    date_hierarchy = 'date'
    readonly_fields = ['calendar']


@admin.register(PayrollRun)
class PayrollRunAdmin(SuperuserOnlyAdminMixin, admin.ModelAdmin):
    list_display = ['year', 'month', 'status', 'rule_set', 'line_count', 'created_at', 'finalized_at']
    list_filter = ['status', 'year', 'month']
    readonly_fields = ['created_at', 'updated_at', 'finalized_at', 'created_by', 'finalized_by',
                       'rule_set', 'configuration_snapshot', 'totals']
    autocomplete_fields = []

    @admin.display(description='Lines')
    def line_count(self, obj):
        return obj.lines.count()

    def has_delete_permission(self, request, obj=None):
        """Block deletion of finalized runs via admin."""
        if obj is not None and obj.status == 'finalized':
            return False
        return super().has_delete_permission(request, obj)

    def delete_model(self, request, obj):
        if obj.status == 'finalized':
            raise ValidationError('Finalized payroll runs cannot be deleted.')
        super().delete_model(request, obj)

    def delete_queryset(self, request, queryset):
        """Block bulk deletion of finalized runs."""
        finalized = queryset.filter(status='finalized')
        if finalized.exists():
            raise ValidationError(
                'Cannot bulk delete: one or more selected runs are finalized.'
            )
        super().delete_queryset(request, queryset)

    def get_actions(self, request):
        actions = super().get_actions(request)
        # Remove the bulk delete action if all visible runs are finalized.
        qs = self.get_queryset(request)
        if qs.exists() and not qs.exclude(status='finalized').exists():
            actions.pop('delete_selected', None)
        return actions


@admin.register(PayrollLine)
class PayrollLineAdmin(SuperuserOnlyAdminMixin, admin.ModelAdmin):
    list_display = ['user', 'run', 'total_gross', 'net_pay', 'total_employer_cost']
    list_filter = ['run__year', 'run__month', 'run__status']
    search_fields = ['user__username']
    readonly_fields = ['created_at', 'updated_at', 'run', 'wage_assignment',
                       'gross_monthly_wage', 'monthly_working_days', 'monthly_standard_hours',
                       'overtime_hours', 'overtime_amount', 'standby_hours', 'standby_amount',
                       'total_gross', 'taxable_base', 'contribution_base',
                       'employee_social', 'employee_health', 'income_tax',
                       'total_employee_deductions', 'net_pay',
                       'employer_social', 'employer_health', 'total_employer_cost',
                       'overtime_breakdown', 'calculation_trace', 'warnings', 'rule_set_version']

    def has_delete_permission(self, request, obj=None):
        """Block deletion of lines belonging to finalized runs."""
        if obj is not None and obj.run.status == 'finalized':
            return False
        return super().has_delete_permission(request, obj)

    def delete_model(self, request, obj):
        if obj.run.status == 'finalized':
            raise ValidationError('Payroll lines belonging to a finalized run are immutable.')
        super().delete_model(request, obj)

    def delete_queryset(self, request, queryset):
        """Block bulk deletion of lines in finalized runs."""
        finalized = queryset.filter(run__status='finalized')
        if finalized.exists():
            raise ValidationError(
                'Cannot bulk delete: one or more selected lines belong to finalized runs.'
            )
        super().delete_queryset(request, queryset)

    def get_actions(self, request):
        actions = super().get_actions(request)
        qs = self.get_queryset(request)
        if qs.exists() and not qs.exclude(run__status='finalized').exists():
            actions.pop('delete_selected', None)
        return actions


@admin.register(PayrollRunEntry)
class PayrollRunEntryAdmin(SuperuserOnlyAdminMixin, admin.ModelAdmin):
    list_display = ['run', 'user', 'source_kind', 'source_id', 'work_date', 'status']
    list_filter = ['status', 'source_kind', 'run__year', 'run__month']
    search_fields = ['user__username', 'source_kind']
    readonly_fields = ['run', 'line', 'source_kind', 'source_id', 'user', 'work_date',
                       'requested_period', 'resolved_period', 'hours', 'overtime_amount',
                       'standby_amount', 'source_status', 'resolution_reason', 'status',
                       'created_at', 'finalized_at']

    def has_delete_permission(self, request, obj=None):
        if obj is not None and (obj.status == 'finalized' or obj.run.status == 'finalized'):
            return False
        return super().has_delete_permission(request, obj)

    def delete_model(self, request, obj):
        if obj.status == 'finalized' or obj.run.status == 'finalized':
            raise ValidationError('Finalized payroll run entries are immutable.')
        super().delete_model(request, obj)

    def delete_queryset(self, request, queryset):
        """Block bulk deletion of finalized entries or entries in finalized runs."""
        finalized = queryset.filter(
            models.Q(status='finalized') | models.Q(run__status='finalized')
        )
        if finalized.exists():
            raise ValidationError(
                'Cannot bulk delete: one or more selected entries are finalized.'
            )
        super().delete_queryset(request, queryset)

    def get_actions(self, request):
        actions = super().get_actions(request)
        qs = self.get_queryset(request)
        if qs.exists() and not qs.exclude(
            models.Q(status='finalized') | models.Q(run__status='finalized')
        ).exists():
            actions.pop('delete_selected', None)
        return actions

    def has_change_permission(self, request, obj=None):
        return False
