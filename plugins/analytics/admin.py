from django.contrib import admin
from core.mixins.permissions import SuperuserOnlyAdminMixin
from .models import AnalyticsSnapshot, AnalyticsMetric, AnalyticsConfiguration, ScheduledReport, ReportTemplate, ExportJob


@admin.register(AnalyticsSnapshot)
class AnalyticsSnapshotAdmin(SuperuserOnlyAdminMixin, admin.ModelAdmin):
    list_display = [
        'snapshot_date',
        'snapshot_type',
        'leave_approved_count',
        'leave_pending_count',
        'overtime_approved_hours',
    ]
    list_filter = ['snapshot_type', 'snapshot_date']
    date_hierarchy = 'snapshot_date'
    readonly_fields = ['created_at', 'updated_at']


@admin.register(AnalyticsMetric)
class AnalyticsMetricAdmin(SuperuserOnlyAdminMixin, admin.ModelAdmin):
    list_display = [
        'metric_type',
        'user',
        'team',
        'value',
        'recorded_at',
    ]
    list_filter = ['metric_type', 'recorded_at']
    search_fields = ['user__username', 'team__name', 'label']
    date_hierarchy = 'recorded_at'
    readonly_fields = ['recorded_at', 'created_at']


@admin.register(AnalyticsConfiguration)
class AnalyticsConfigurationAdmin(SuperuserOnlyAdminMixin, admin.ModelAdmin):
    list_display = [
        'snapshot_frequency',
        'data_retention_days',
        'auto_snapshot_enabled',
        'trend_threshold',
        'concentration_threshold',
        'updated_at'
    ]
    list_filter = ['snapshot_frequency', 'auto_snapshot_enabled']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(ScheduledReport)
class ScheduledReportAdmin(SuperuserOnlyAdminMixin, admin.ModelAdmin):
    list_display = [
        'name',
        'schedule_type',
        'report_format',
        'is_active',
        'last_run_at',
        'next_run_at'
    ]
    list_filter = ['schedule_type', 'report_format', 'is_active']
    readonly_fields = ['last_run_at', 'next_run_at', 'created_at', 'updated_at']


@admin.register(ReportTemplate)
class ReportTemplateAdmin(SuperuserOnlyAdminMixin, admin.ModelAdmin):
    list_display = [
        'name',
        'created_at',
        'updated_at'
    ]
    readonly_fields = ['created_at', 'updated_at']


@admin.register(ExportJob)
class ExportJobAdmin(SuperuserOnlyAdminMixin, admin.ModelAdmin):
    list_display = [
        'id',
        'status',
        'report_format',
        'file_size_bytes',
        'created_by',
        'created_at',
        'completed_at',
    ]
    list_filter = ['status', 'report_format']
    readonly_fields = ['created_at', 'completed_at']
    search_fields = ['created_by__username']
    actions = ['cleanup_selected_files']

    @admin.action(description='Delete selected jobs and their files')
    def cleanup_selected_files(self, request, queryset):
        count = 0
        for job in queryset:
            job.delete_file()
            count += 1
        self.message_user(request, f"Cleaned up {count} export file(s).")
