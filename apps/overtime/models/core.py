"""
Overtime app core models.

This module contains models for overtime tracking including clients and overtime logs.
"""

import re

from django.core.exceptions import ValidationError
from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
from core.models.abstract import BaseModel


class ProcessingPeriodManager(models.Manager):
    """Assign processing periods for bulk-created overtime rows."""

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


class Client(BaseModel):
    """
    Client model for tracking which client the overtime was for.
    
    Used to categorize overtime entries by client/project.
    """
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=20, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        db_table = 'clients'
        ordering = ['name']
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['is_active']),
        ]
        constraints = [
            models.UniqueConstraint(fields=['name'], name='client_name_unique'),
        ]
    
    def __str__(self):
        return f"{self.name} ({self.code})"


def normalize_ticket_reference(value: str) -> str:
    """Normalize a ticket reference for duplicate detection and matching."""
    value = str(value or '').strip().lower()
    value = re.sub(r'^(?:inc|ticket|t|#)\s*-?\s*', '', value)
    return re.sub(r'\s+', '', value)


def clean_ticket_references(values):
    """Validate and stable-deduplicate structured ticket references."""
    if values in (None, ''):
        return []
    if not isinstance(values, list):
        raise ValidationError({'ticket_references': 'Must be a list of strings.'})
    if len(values) > 20:
        raise ValidationError({'ticket_references': 'A maximum of 20 references is allowed.'})

    cleaned = []
    seen = set()
    for value in values:
        if not isinstance(value, str):
            raise ValidationError({'ticket_references': 'Every reference must be a string.'})
        display_value = value.strip()
        if not display_value:
            raise ValidationError({'ticket_references': 'References cannot be blank.'})
        if len(display_value) > 200:
            raise ValidationError({'ticket_references': 'Each reference must be 200 characters or fewer.'})
        normalized = normalize_ticket_reference(display_value)
        if normalized and normalized not in seen:
            seen.add(normalized)
            cleaned.append(display_value)
    return cleaned


class OvertimeLog(BaseModel):
    """
    Overtime log entry model.

    Tracks overtime hours worked by users for specific clients.
    Includes status tracking for approval workflow.
    """
    objects = ProcessingPeriodManager()
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]
    EVIDENCE_TYPE_CHOICES = [
        ('ticket', 'Ticket'),
        ('email', 'Email'),
        ('call', 'Call'),
        ('other', 'Other'),
    ]

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='overtime_logs',
        db_index=True
    )
    client = models.ForeignKey(
        Client,
        on_delete=models.CASCADE,
        related_name='overtime_logs',
        db_index=True
    )
    date = models.DateField()
    submitted_at = models.DateTimeField(default=timezone.now, editable=False, db_index=True)
    requested_processing_period = models.DateField(null=True, blank=True, db_index=True)
    approval_period_close = models.ForeignKey(
        'users.ApprovalPeriodClose',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='overtime_logs',
    )
    resolved_settlement_period = models.DateField(null=True, blank=True, db_index=True)
    hours = models.DecimalField(max_digits=5, decimal_places=2)
    description = models.TextField(blank=True)
    start_time = models.TimeField(null=True, blank=True, help_text="Start time in 24h format")
    end_time = models.TimeField(null=True, blank=True, help_text="End time in 24h format")
    evidence_type = models.CharField(
        max_length=20,
        choices=EVIDENCE_TYPE_CHOICES,
        default='other',
        blank=True
    )
    evidence = models.TextField(blank=True, help_text="Ticket numbers, call references, release tags")
    ticket_references = models.JSONField(
        default=list,
        blank=True,
        help_text='Structured ticket references; maximum 20 entries.',
    )
    reference_code = models.CharField(max_length=50, blank=True)
    
    # Status and approval
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )
    approved_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='approved_overtime',
        db_index=True
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)

    class Meta:
        db_table = 'overtime_logs'
        ordering = ['-date', '-created_at']
        indexes = [
            models.Index(fields=['user', 'date']),
            models.Index(fields=['client', 'status']),
            models.Index(fields=['user', 'status', 'date']),
            models.Index(fields=['requested_processing_period', 'status']),
            models.Index(fields=['user', 'requested_processing_period']),
            models.Index(fields=['client']),
            models.Index(fields=['status']),
            models.Index(fields=['date']),
        ]
    
    def __str__(self):
        return f"{self.user.username} - {self.date} - {self.hours}h"

    def clean(self):
        super().clean()
        self.ticket_references = clean_ticket_references(self.ticket_references)
    
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
                end += timedelta(days=1)  # Handle overnight (e.g., 18:00 to 09:00)
            diff_minutes = (end - start).total_seconds() / 60
            # Round up to next hour if any minutes
            calculated_hours = int(diff_minutes // 60) + (1 if diff_minutes % 60 > 0 else 0)
            self.hours = calculated_hours
        
        if self.hours <= 0:
            raise ValueError("Hours must be greater than 0")
        if self.hours > 24:
            raise ValueError("Hours cannot exceed 24 in a single day")
        super().save(*args, **kwargs)
