"""
Reports app core models.

This module contains models for report generation and storage.
"""

from django.db import models
from django.contrib.auth.models import User
from core.models.abstract import BaseModel


class ReportTemplate(BaseModel):
    """
    Report template for defining report structures.
    
    Stores report configurations that can be reused.
    """
    REPORT_TYPE_CHOICES = [
        ('overtime', 'Overtime Report'),
        ('standby', 'Standby Report'),
        ('leave', 'Leave Report'),
        ('combined', 'Combined Report'),
        ('wages', 'Wage Report'),
    ]
    
    name = models.CharField(max_length=200)
    report_type = models.CharField(
        max_length=20,
        choices=REPORT_TYPE_CHOICES
    )
    description = models.TextField(blank=True)
    
    # Template configuration (JSON)
    configuration = models.JSONField(default=dict)
    
    # Filters
    date_range_start = models.DateField(null=True, blank=True)
    date_range_end = models.DateField(null=True, blank=True)
    
    is_active = models.BooleanField(default=True)
    
    class Meta:
        db_table = 'report_templates'
        ordering = ['name']
        indexes = [
            models.Index(fields=['report_type']),
            models.Index(fields=['is_active']),
        ]
        constraints = [
            models.UniqueConstraint(fields=['name'], name='report_template_name_unique'),
        ]
    
    def __str__(self):
        return self.name


class GeneratedReport(BaseModel):
    """
    Generated report instance.
    
    Stores metadata about generated reports including file paths.
    """
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('generating', 'Generating'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]
    
    template = models.ForeignKey(
        ReportTemplate,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='generated_reports'
    )
    
    generated_by = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='generated_reports'
    )
    
    # Report metadata
    name = models.CharField(max_length=200)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )
    
    # Date range for this report
    date_range_start = models.DateField()
    date_range_end = models.DateField()
    
    # File storage
    file_path = models.CharField(max_length=500, blank=True)
    file_size = models.IntegerField(null=True, blank=True)
    file_format = models.CharField(max_length=10, default='xlsx')
    
    # Error tracking
    error_message = models.TextField(blank=True)
    
    class Meta:
        db_table = 'generated_reports'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['generated_by']),
            models.Index(fields=['status']),
            models.Index(fields=['date_range_start', 'date_range_end']),
        ]
    
    def __str__(self):
        return f"{self.name} ({self.status})"


class AuditLog(models.Model):
    """
    Records all changes to critical models for accountability.
    """
    ACTION_CHOICES = [
        ('CREATE', 'Create'),
        ('UPDATE', 'Update'),
        ('DELETE', 'Delete'),
        ('APPROVE', 'Approve'),
        ('REJECT', 'Reject'),
        ('BULK_APPROVE', 'Bulk Approve'),
        ('BULK_REJECT', 'Bulk Reject'),
    ]

    MODEL_CHOICES = [
        ('overtimelog', 'Overtime Log'),
        ('standbylog', 'Standby Log'),
        ('leaverequest', 'Leave Request'),
        ('user', 'User'),
        ('team', 'Team'),
        ('client', 'Client'),
    ]

    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs',
        help_text='User who performed the action'
    )
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    model_name = models.CharField(max_length=50, choices=MODEL_CHOICES)
    object_id = models.CharField(max_length=50, help_text='ID of the affected object')
    object_repr = models.CharField(max_length=255, help_text='String representation of object')
    old_values = models.JSONField(null=True, blank=True, help_text='Previous field values')
    new_values = models.JSONField(null=True, blank=True, help_text='New field values')
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    extra_data = models.JSONField(null=True, blank=True, help_text='Additional context')

    class Meta:
        db_table = 'audit_logs'
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['model_name', 'object_id']),
            models.Index(fields=['user', '-timestamp']),
            models.Index(fields=['action', '-timestamp']),
        ]
        verbose_name = 'Audit Log'
        verbose_name_plural = 'Audit Logs'

    def __str__(self):
        return f"{self.action} {self.model_name} #{self.object_id} by {self.user}"

    @property
    def changes_summary(self) -> str:
        """Generate a human-readable summary of changes."""
        if not self.old_values or not self.new_values:
            return f"{self.action} {self.model_name}"

        changes = []
        for key in self.new_values:
            old_val = self.old_values.get(key, 'None')
            new_val = self.new_values.get(key, 'None')
            if old_val != new_val:
                changes.append(f"{key}: {old_val} → {new_val}")
        return "; ".join(changes) if changes else f"{self.action} {self.model_name}"


def log_audit_action(
    user,
    action,
    model_name,
    object_id,
    object_repr,
    old_values=None,
    new_values=None,
    ip_address=None,
    user_agent='',
    extra_data=None
):
    """
    Helper function to create an audit log entry.
    """
    return AuditLog.objects.create(
        user=user,
        action=action,
        model_name=model_name,
        object_id=str(object_id),
        object_repr=str(object_repr)[:255],
        old_values=old_values,
        new_values=new_values,
        ip_address=ip_address,
        user_agent=user_agent[:500],
        extra_data=extra_data
    )
