from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
from core.models.abstract import BaseModel
from apps.overtime.models import Client


class ProcessingPeriodManager(models.Manager):
    """Assign processing periods for bulk-created standby rows."""

    def bulk_create(self, objs, *args, **kwargs):
        from apps.users.models import ApprovalPeriodClose
        from apps.users.services.approval_periods import normalize_period, resolve_processing_assignment

        for obj in objs:
            if obj.requested_processing_period is not None or not obj.user_id or not obj.date:
                continue
            period = normalize_period(obj.date)
            if ApprovalPeriodClose.objects.filter(boundary__period=period).exists():
                assignment = resolve_processing_assignment(obj.user, obj.date)
                obj.submitted_at = assignment['submitted_at']
                obj.requested_processing_period = assignment['requested_processing_period']
                obj.approval_period_close = assignment['approval_period_close']
            else:
                obj.requested_processing_period = period
        return super().bulk_create(objs, *args, **kwargs)


class StandbyPattern(BaseModel):
    """
    Recurring standby pattern for automated scheduling.
    
    Defines patterns for daily, weekly, weekend, or custom standby schedules.
    """
    RECURRENCE_CHOICES = [
        ('daily', 'Daily'),
        ('weekly', 'Weekly'),
        ('weekend', 'Weekend'),
        ('custom', 'Custom'),
    ]
    
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='standby_patterns',
        db_index=True
    )
    name = models.CharField(max_length=100)
    recurrence_type = models.CharField(
        max_length=20,
        choices=RECURRENCE_CHOICES,
        default='weekly'
    )
    day_of_week = models.IntegerField(
        blank=True,
        null=True,
        help_text='For weekly pattern: 0=Monday, 6=Sunday'
    )
    start_time = models.TimeField()
    end_time = models.TimeField()
    valid_from = models.DateField()
    valid_until = models.DateField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    deleted_by = models.ForeignKey(
        User,
        blank=True,
        null=True,
        on_delete=models.SET_NULL,
        related_name='deleted_standby_patterns'
    )
    
    class Meta:
        db_table = 'standby_patterns'
        ordering = ['user', 'name']
        indexes = [
            models.Index(fields=['user']),
            models.Index(fields=['recurrence_type']),
            models.Index(fields=['is_active']),
        ]
        constraints = [
            models.UniqueConstraint(fields=['user', 'name'], name='standby_pattern_user_name_unique'),
        ]
    
    def __str__(self):
        return f"{self.user.username} - {self.name} ({self.get_recurrence_type_display()})"


class StandbyLog(BaseModel):
    """
    Standby log entry model.

    Tracks standby hours for on-call support with approval workflow.
    Compatible with Analytics plugin (maps scheduled→pending, completed→approved).
    """
    objects = ProcessingPeriodManager()
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]
    
    # Analytics compatibility - these are aliases for the main status
    @property
    def is_scheduled(self):
        return self.status == 'pending'
    
    @property
    def is_completed(self):
        return self.status == 'approved'
    
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='standby_logs',
        db_index=True
    )
    pattern = models.ForeignKey(
        'StandbyPattern',
        blank=True,
        null=True,
        on_delete=models.SET_NULL,
        related_name='logs'
    )
    clients = models.ManyToManyField(
        Client,
        blank=True,
        related_name='standby_logs',
        help_text='Clients covered by this standby entry (multiple allowed).',
    )
    date = models.DateField()
    submitted_at = models.DateTimeField(default=timezone.now, editable=False, db_index=True)
    requested_processing_period = models.DateField(null=True, blank=True, db_index=True)
    approval_period_close = models.ForeignKey(
        'users.ApprovalPeriodClose',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='standby_logs',
    )
    resolved_settlement_period = models.DateField(null=True, blank=True, db_index=True)
    hours = models.DecimalField(max_digits=5, decimal_places=2)
    description = models.TextField(blank=True)
    
    # Time tracking
    start_time = models.TimeField(
        blank=True,
        null=True,
        help_text='Start time in 24h format'
    )
    end_time = models.TimeField(
        blank=True,
        null=True,
        help_text='End time in 24h format'
    )
    
    # Evidence and approval
    evidence = models.TextField(blank=True, help_text='Ticket numbers, call references, etc.')
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )
    approved_by = models.ForeignKey(
        User,
        blank=True,
        null=True,
        on_delete=models.SET_NULL,
        related_name='approved_standby',
        db_index=True
    )
    approved_at = models.DateTimeField(blank=True, null=True)
    rejection_reason = models.TextField(blank=True)

    class Meta:
        db_table = 'standby_logs'
        ordering = ['-date', '-created_at']
        indexes = [
            models.Index(fields=['user', 'date']),
            models.Index(fields=['status']),
            models.Index(fields=['requested_processing_period', 'status']),
            models.Index(fields=['user', 'requested_processing_period']),
            models.Index(fields=['date']),
            models.Index(fields=['user', 'status', 'date']),
        ]
    
    def __str__(self):
        return f"{self.user.username} - {self.date} - {self.hours}h ({self.status})"
    
    def save(self, *args, **kwargs):
        """Validate hours, calculate time ranges, and assign processing period."""
        if self.requested_processing_period is None and self.user_id and self.date:
            from apps.users.services.approval_periods import resolve_processing_assignment
            assignment = resolve_processing_assignment(self.user, self.date)
            self.submitted_at = assignment['submitted_at']
            self.requested_processing_period = assignment['requested_processing_period']
            self.approval_period_close = assignment['approval_period_close']

        # Auto-calculate hours from start/end times if both provided
        if self.start_time and self.end_time:
            from datetime import datetime, timedelta
            start = datetime.combine(datetime.today(), self.start_time)
            end = datetime.combine(datetime.today(), self.end_time)
            if end <= start:
                end += timedelta(days=1)  # Handle overnight
            diff_minutes = (end - start).total_seconds() / 60
            calculated_hours = int(diff_minutes // 60) + (1 if diff_minutes % 60 > 0 else 0)
            self.hours = calculated_hours
        
        if self.hours <= 0:
            raise ValueError("Hours must be greater than 0")
        if self.hours > 24:
            raise ValueError("Hours cannot exceed 24 in a single day")
        super().save(*args, **kwargs)
