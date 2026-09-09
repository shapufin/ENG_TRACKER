from django.db import models
from django.contrib.auth.models import User
from django.utils.translation import gettext_lazy as _
from django.contrib.contenttypes.models import ContentType
from django.contrib.contenttypes.fields import GenericForeignKey


class AuditLog(models.Model):
    """
    Audit log for tracking all user actions and data changes.
    """
    ACTION_TYPES = [
        ('create', _('Create')),
        ('update', _('Update')),
        ('delete', _('Delete')),
        ('approve', _('Approve')),
        ('reject', _('Reject')),
        ('view', _('View')),
        ('export', _('Export')),
        ('login', _('Login')),
        ('logout', _('Logout')),
        ('other', _('Other')),
        ('superuser_override_delete', _('Superuser Override Delete')),
        ('create_for_user', _('Create for User')),
        ('approval_period_finalize', _('Approval Period Finalize')),
        ('analytics_export', _('Analytics Export')),
        ('analytics_export_job_created', _('Analytics Export Job Created')),
        ('plugin_uninstall', _('Plugin Uninstall')),
        ('data_import', _('Data Import')),
        ('payroll_config_update', _('Payroll Config Update')),
        ('payroll_wage_create', _('Payroll Wage Create')),
        ('payroll_wage_update', _('Payroll Wage Update')),
        ('payroll_wage_bulk_create', _('Payroll Wage Bulk Create')),
        ('payroll_ruleset_child_mutation', _('Payroll Ruleset Child Mutation')),
        ('payroll_ruleset_clone', _('Payroll Ruleset Clone')),
        ('payroll_ruleset_child_delete', _('Payroll Ruleset Child Delete')),
        ('payroll_ruleset_create', _('Payroll Ruleset Create')),
        ('payroll_ruleset_update', _('Payroll Ruleset Update')),
        ('payroll_ruleset_delete', _('Payroll Ruleset Delete')),
        ('payroll_calendar_generate', _('Payroll Calendar Generate')),
        ('payroll_calendar_create', _('Payroll Calendar Create')),
        ('payroll_calendar_update', _('Payroll Calendar Update')),
        ('payroll_calendar_delete', _('Payroll Calendar Delete')),
        ('payroll_holiday_add', _('Payroll Holiday Add')),
        ('payroll_holiday_update', _('Payroll Holiday Update')),
        ('payroll_holiday_remove', _('Payroll Holiday Remove')),
        ('payroll_run_create', _('Payroll Run Create')),
        ('payroll_run_delete', _('Payroll Run Delete')),
        ('payroll_run_generate', _('Payroll Run Generate')),
        ('payroll_run_generate_line', _('Payroll Run Generate Line')),
        ('payroll_run_finalize', _('Payroll Run Finalize')),
        ('payroll_run_cancel', _('Payroll Run Cancel')),
        ('payroll_export_excel', _('Payroll Export Excel')),
        ('payroll_payslip_pdf', _('Payroll Payslip PDF')),
        ('control_room_access_create', _('Control Room Access Create')),
        ('control_room_access_update', _('Control Room Access Update')),
        ('control_room_access_delete', _('Control Room Access Delete')),
        ('control_room_scope_add', _('Control Room Scope Add')),
        ('control_room_scope_remove', _('Control Room Scope Remove')),
        ('control_room_user_created', _('Control Room User Created')),
        ('control_room_user_updated', _('Control Room User Updated')),
        ('control_room_users_bulk_updated', _('Control Room Users Bulk Updated')),
        ('rule_mutation', _('Rule Mutation')),
    ]

    # User who performed the action
    user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='plugin_audit_logs'
    )

    # Action details
    action = models.CharField(
        _('Action'),
        max_length=50,
        choices=ACTION_TYPES,
        db_index=True
    )
    description = models.TextField(_('Description'), blank=True)
    
    # Object being acted upon (generic foreign key)
    content_type = models.ForeignKey(
        ContentType,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    object_id = models.PositiveIntegerField(null=True, blank=True)
    content_object = GenericForeignKey('content_type', 'object_id')
    
    # Change tracking
    old_values = models.JSONField(_('Old Values'), default=dict, blank=True)
    new_values = models.JSONField(_('New Values'), default=dict, blank=True)
    
    # Request metadata
    ip_address = models.GenericIPAddressField(_('IP Address'), null=True, blank=True)
    user_agent = models.TextField(_('User Agent'), blank=True)
    
    # Status
    status = models.CharField(
        _('Status'),
        max_length=20,
        choices=[
            ('success', _('Success')),
            ('failure', _('Failure')),
            ('pending', _('Pending')),
        ],
        default='success'
    )
    
    # Timestamps
    timestamp = models.DateTimeField(_('Timestamp'), auto_now_add=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _('Audit Log')
        verbose_name_plural = _('Audit Logs')
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['user', '-timestamp']),
            models.Index(fields=['action', '-timestamp']),
            models.Index(fields=['content_type', 'object_id']),
        ]

    def __str__(self):
        return f"{self.user} - {self.get_action_display()} - {self.timestamp}"


class AuditLogFilter(models.Model):
    """
    Saved audit log filters for quick access.
    """
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='audit_log_filters'
    )
    name = models.CharField(_('Filter Name'), max_length=255)
    description = models.TextField(_('Description'), blank=True)
    
    # Filter criteria
    action = models.CharField(
        _('Action'),
        max_length=50,
        choices=AuditLog.ACTION_TYPES,
        blank=True
    )
    start_date = models.DateTimeField(_('Start Date'), null=True, blank=True)
    end_date = models.DateTimeField(_('End Date'), null=True, blank=True)
    target_user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_log_filters_targeting'
    )
    
    # Metadata
    is_public = models.BooleanField(_('Public'), default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('Audit Log Filter')
        verbose_name_plural = _('Audit Log Filters')
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(fields=['user', 'name'], name='audit_log_filter_user_name_unique'),
        ]
        indexes = [models.Index(fields=['user'])]

    def __str__(self):
        return f"{self.user} - {self.name}"
