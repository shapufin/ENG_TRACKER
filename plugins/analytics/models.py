from django.db import models
from django.contrib.auth.models import User
from django.utils.translation import gettext_lazy as _
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver


class AnalyticsSnapshot(models.Model):
    """
    Periodic snapshot of analytics metrics for historical tracking.
    """
    SNAPSHOT_TYPES = [
        ('daily', _('Daily')),
        ('weekly', _('Weekly')),
        ('monthly', _('Monthly')),
    ]

    snapshot_type = models.CharField(
        _('Snapshot Type'),
        max_length=20,
        choices=SNAPSHOT_TYPES,
        default='daily'
    )
    snapshot_date = models.DateField(_('Snapshot Date'), db_index=True)
    
    # Leave metrics
    leave_approved_count = models.IntegerField(_('Approved Leave Requests'), default=0)
    leave_pending_count = models.IntegerField(_('Pending Leave Requests'), default=0)
    leave_rejected_count = models.IntegerField(_('Rejected Leave Requests'), default=0)
    leave_total_days = models.DecimalField(_('Total Leave Days'), max_digits=10, decimal_places=2, default=0)
    
    # Overtime metrics
    overtime_approved_hours = models.DecimalField(_('Approved Overtime Hours'), max_digits=10, decimal_places=2, default=0)
    overtime_pending_hours = models.DecimalField(_('Pending Overtime Hours'), max_digits=10, decimal_places=2, default=0)
    
    # Standby metrics
    standby_scheduled_count = models.IntegerField(_('Scheduled Standby'), default=0)
    standby_completed_count = models.IntegerField(_('Completed Standby'), default=0)
    
    # User metrics
    total_users = models.IntegerField(_('Total Users'), default=0)
    active_users = models.IntegerField(_('Active Users'), default=0)
    
    # Hours metrics
    total_hours = models.DecimalField(_('Total Hours'), max_digits=10, decimal_places=2, default=0)
    average_hours = models.DecimalField(_('Average Hours'), max_digits=10, decimal_places=2, default=0)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('Analytics Snapshot')
        verbose_name_plural = _('Analytics Snapshots')
        ordering = ['-snapshot_date']
        indexes = [
            models.Index(fields=['snapshot_type', '-snapshot_date']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['snapshot_type', 'snapshot_date'],
                name='analytics_snapshot_type_date_unique',
            ),
        ]

    def __str__(self):
        return f"{self.get_snapshot_type_display()} - {self.snapshot_date}"


class AnalyticsMetric(models.Model):
    """
    Individual metric data point for detailed analytics.
    """
    METRIC_TYPES = [
        ('leave_approval_rate', _('Leave Approval Rate')),
        ('team_performance', _('Team Performance')),
        ('user_balance', _('User Balance')),
    ]

    metric_type = models.CharField(
        _('Metric Type'),
        max_length=50,
        choices=METRIC_TYPES,
        db_index=True
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='analytics_metrics'
    )
    team = models.ForeignKey(
        'users.Team',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='analytics_metrics'
    )
    
    # Metric data
    value = models.DecimalField(_('Value'), max_digits=15, decimal_places=2)
    label = models.CharField(_('Label'), max_length=255, blank=True)
    metadata = models.JSONField(_('Metadata'), default=dict, blank=True)
    
    recorded_at = models.DateTimeField(_('Recorded At'), auto_now_add=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _('Analytics Metric')
        verbose_name_plural = _('Analytics Metrics')
        ordering = ['-recorded_at']
        indexes = [
            models.Index(fields=['metric_type', '-recorded_at']),
            models.Index(fields=['user', '-recorded_at']),
            models.Index(fields=['team', '-recorded_at']),
        ]

    def __str__(self):
        return f"{self.get_metric_type_display()} - {self.value}"


class AnalyticsConfiguration(models.Model):
    """
    Configuration settings for the Analytics plugin.
    Controls snapshot frequency, data retention, and metric collection.
    """
    SNAPSHOT_FREQUENCIES = [
        ('daily', _('Daily')),
        ('weekly', _('Weekly')),
        ('monthly', _('Monthly')),
    ]

    snapshot_frequency = models.CharField(
        _('Snapshot Frequency'),
        max_length=20,
        choices=SNAPSHOT_FREQUENCIES,
        default='daily'
    )
    data_retention_days = models.IntegerField(
        _('Data Retention Days'),
        default=365,
        help_text=_('Number of days to keep historical analytics data')
    )
    enabled_metrics = models.JSONField(
        _('Enabled Metrics'),
        default=list,
        blank=True,
        help_text=_('List of metric types to track')
    )
    auto_snapshot_enabled = models.BooleanField(
        _('Auto Snapshot Enabled'),
        default=True,
        help_text=_('Whether to automatically generate snapshots')
    )
    
    # Threshold Alerts
    enable_threshold_alerts = models.BooleanField(
        _('Enable Threshold Alerts'),
        default=False,
        help_text=_('Send alerts when metrics exceed thresholds')
    )
    mtta_threshold_hours = models.FloatField(
        _('MTTA Threshold (Hours)'),
        default=48,
        help_text=_('Mean Time to Approval threshold before alerting')
    )
    alert_recipients = models.JSONField(
        _('Alert Recipients'),
        default=list,
        blank=True,
        help_text=_('User IDs to notify when thresholds are exceeded')
    )

    # Insight engine thresholds (configurable by admin)
    trend_threshold = models.FloatField(
        _('Trend Threshold'),
        default=0.15,
        help_text=_('Minimum percentage change (0-1) to trigger a trend insight. Default: 0.15 (15%)')
    )
    concentration_threshold = models.FloatField(
        _('Concentration Threshold'),
        default=0.40,
        help_text=_('Minimum share (0-1) by one user to trigger concentration alert. Default: 0.40 (40%)')
    )
    spike_threshold = models.FloatField(
        _('Spike Threshold'),
        default=2.0,
        help_text=_('Multiplier of daily average to trigger spike insight. Default: 2.0 (2x)')
    )
    backlog_threshold = models.IntegerField(
        _('Backlog Threshold'),
        default=5,
        help_text=_('Minimum pending items to trigger backlog alert. Default: 5')
    )
    status_bottleneck_threshold = models.FloatField(
        _('Status Bottleneck Threshold'),
        default=0.30,
        help_text=_('Minimum pending ratio (0-1) to trigger bottleneck alert. Default: 0.30 (30%)')
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('Analytics Configuration')
        verbose_name_plural = _('Analytics Configurations')
        constraints = [
            models.CheckConstraint(
                condition=models.Q(pk=1),
                name='analytics_configuration_singleton',
            ),
        ]

    def __str__(self):
        return f"Analytics Config - {self.get_snapshot_frequency_display()}"


class AnalyticsDailyBucket(models.Model):
    """
    Pre-aggregated daily metrics for high-performance reporting.
    Reduces the need for real-time complex joins on large datasets.
    """
    date = models.DateField(unique=True, db_index=True)
    
    # Aggregated totals
    leave_days = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    overtime_hours = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    standby_hours = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    
    # Metadata for drill-downs (JSON blob for team-wise breakdown)
    team_data = models.JSONField(default=dict, blank=True)
    client_data = models.JSONField(default=dict, blank=True)
    
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('Analytics Daily Bucket')
        verbose_name_plural = _('Analytics Daily Buckets')
        ordering = ['-date']

    def __str__(self):
        return f"Bucket - {self.date}"


class ScheduledReport(models.Model):
    """
    Scheduled reports for automatic delivery via email.
    """
    SCHEDULE_TYPES = [
        ('daily', _('Daily')),
        ('weekly', _('Weekly')),
        ('monthly', _('Monthly')),
    ]
    
    FORMAT_CHOICES = [
        ('excel', _('Excel')),
        ('pdf', _('PDF')),
        ('csv', _('CSV')),
    ]

    name = models.CharField(_('Report Name'), max_length=255)
    description = models.TextField(_('Description'), blank=True)
    schedule_type = models.CharField(
        _('Schedule Type'),
        max_length=20,
        choices=SCHEDULE_TYPES,
        default='weekly'
    )
    recipients = models.JSONField(
        _('Recipients'),
        default=list,
        help_text=_('List of email addresses')
    )
    filter_preset = models.JSONField(
        _('Filter Preset'),
        default=dict,
        blank=True,
        help_text=_('JSON representation of filter parameters')
    )
    report_format = models.CharField(
        _('Format'),
        max_length=10,
        choices=FORMAT_CHOICES,
        default='excel'
    )
    is_active = models.BooleanField(_('Active'), default=True)
    last_run_at = models.DateTimeField(_('Last Run'), null=True, blank=True)
    next_run_at = models.DateTimeField(_('Next Run'), null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('Scheduled Report')
        verbose_name_plural = _('Scheduled Reports')
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(fields=['name'], name='scheduled_report_name_unique'),
        ]

    def __str__(self):
        return self.name


class ExportJob(models.Model):
    """
    Background export job for large analytics reports.
    Tracks the status of an Excel/CSV export that runs in a thread,
    stores the generated file on disk, and provides a download URL.
    """
    STATUS_CHOICES = [
        ('pending', _('Pending')),
        ('running', _('Running')),
        ('completed', _('Completed')),
        ('failed', _('Failed')),
    ]

    FORMAT_CHOICES = [
        ('excel', _('Excel')),
        ('csv', _('CSV')),
    ]

    status = models.CharField(_('Status'), max_length=20, choices=STATUS_CHOICES, default='pending')
    report_format = models.CharField(_('Format'), max_length=10, choices=FORMAT_CHOICES, default='excel')
    filter_params = models.JSONField(_('Filter Parameters'), default=dict)
    file_path = models.CharField(_('File Path'), max_length=500, blank=True)
    error_message = models.TextField(_('Error Message'), blank=True)
    file_size_bytes = models.BigIntegerField(_('File Size'), default=0)

    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True,
        related_name='analytics_export_jobs'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = _('Export Job')
        verbose_name_plural = _('Export Jobs')
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['created_by', '-created_at']),
        ]

    def __str__(self):
        return f"Export {self.id} - {self.status} - {self.report_format}"

    @property
    def is_ready(self):
        return self.status == 'completed' and bool(self.file_path)

    def delete_file(self):
        """Delete the generated file from disk."""
        import os
        if self.file_path and os.path.exists(self.file_path):
            try:
                os.remove(self.file_path)
            except OSError:
                pass


# Signal: delete the file when an ExportJob is deleted
@receiver(post_delete, sender=ExportJob)
def _export_job_post_delete(sender, instance, **kwargs):
    """Clean up the file on disk when an ExportJob is deleted."""
    instance.delete_file()


def _invalidate_threshold_cache():
    """Clear the cached insight thresholds."""
    from django.core.cache import cache
    try:
        cache.delete('analytics_insight_thresholds')
    except Exception:
        pass


@receiver(post_save, sender=AnalyticsConfiguration)
def _analytics_config_post_save(sender, instance, **kwargs):
    """Invalidate the threshold cache when config is updated."""
    _invalidate_threshold_cache()


@receiver(post_delete, sender=AnalyticsConfiguration)
def _analytics_config_post_delete(sender, instance, **kwargs):
    """Invalidate the threshold cache when config is deleted."""
    _invalidate_threshold_cache()


class ReportTemplate(models.Model):
    """
    Custom templates for analytics reports.
    """
    name = models.CharField(_('Template Name'), max_length=255)
    description = models.TextField(_('Description'), blank=True)
    
    layout_config = models.JSONField(
        _('Layout Config'),
        default=dict,
        help_text=_('JSON defining the report layout')
    )
    column_selection = models.JSONField(
        _('Column Selection'),
        default=list,
        help_text=_('List of columns to include')
    )
    chart_config = models.JSONField(
        _('Chart Config'),
        default=dict,
        blank=True,
        help_text=_('Configuration for embedded charts')
    )
    branding_config = models.JSONField(
        _('Branding Config'),
        default=dict,
        blank=True,
        help_text=_('Custom logos, colors, and headers')
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('Report Template')
        verbose_name_plural = _('Report Templates')
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(fields=['name'], name='analytics_report_template_name_unique'),
        ]

    def __str__(self):
        return self.name
