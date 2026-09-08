from django.contrib import admin
from core.mixins.permissions import SuperuserOnlyAdminMixin
from .models import LeaveBalance, LeaveRequest, GlobalSettings

@admin.register(GlobalSettings)
class GlobalSettingsAdmin(SuperuserOnlyAdminMixin, admin.ModelAdmin):
    list_display = ['default_yearly_leave_days', 'carry_over_expiry_month', 'carry_over_expiry_day']

@admin.register(LeaveBalance)
class LeaveBalanceAdmin(SuperuserOnlyAdminMixin, admin.ModelAdmin):
    list_display = ['user', 'leave_type', 'year', 'total_days', 'used_days', 'available_days']
    list_filter = ['leave_type', 'year', 'is_carry_over']
    search_fields = ['user__username', 'user__first_name', 'user__last_name']

@admin.register(LeaveRequest)
class LeaveRequestAdmin(SuperuserOnlyAdminMixin, admin.ModelAdmin):
    list_display = ['user', 'request_type', 'start_date', 'end_date', 'days_requested', 'status']
    list_filter = ['request_type', 'status', 'start_date']
    search_fields = ['user__username', 'reason']

    def has_delete_permission(self, request, obj=None):
        return False
