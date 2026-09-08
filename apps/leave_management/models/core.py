"""
Leave management app core models.

This module contains models for leave tracking including requests and balance.
"""

from datetime import timedelta

from django.core.exceptions import ValidationError
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth.models import User
from django.utils import timezone
from django.utils.dateparse import parse_date
from core.models.abstract import BaseModel


def count_business_days(start_date, end_date) -> int:
    """Count weekdays (Mon–Fri) inclusive between two dates.

    Used for leave balance validation and ``LeaveRequest.days_requested``.
    Must stay identical across both call sites — calendar-day counting
    over-deducts balances when ranges include weekends.
    """
    if start_date is None or end_date is None:
        return 0
    if end_date < start_date:
        return 0
    total = 0
    current = start_date
    while current <= end_date:
        if current.weekday() < 5:  # 0=Monday … 4=Friday
            total += 1
        current += timedelta(days=1)
    return total


class GlobalSettings(BaseModel):
    """
    Global leave settings configurable by admin.
    Single-row singleton table.
    """
    DEFAULT_CARRY_OVER_MONTH = 3  # March (end of Q1)
    DEFAULT_CARRY_OVER_DAY = 31   # Last day of March

    default_yearly_leave_days = models.DecimalField(
        max_digits=5, decimal_places=1, default=22.0,
        help_text='Default leave days per year for new users'
    )
    carry_over_expiry_month = models.PositiveSmallIntegerField(
        default=DEFAULT_CARRY_OVER_MONTH,
        help_text='Month when carried-over days expire (1-12, default 3 = March)'
    )
    carry_over_expiry_day = models.PositiveSmallIntegerField(
        default=DEFAULT_CARRY_OVER_DAY,
        help_text='Day of the month when carried-over days expire (default 31)'
    )

    class Meta:
        db_table = 'leave_global_settings'
        constraints = [
            models.CheckConstraint(
                condition=models.Q(pk=1),
                name='leave_global_settings_singleton',
            ),
        ]

    def __str__(self):
        return f'Leave settings: {self.default_yearly_leave_days}d/year, carry-over expires {self.carry_over_expiry_month}/{self.carry_over_expiry_day}'


class LeaveBalance(BaseModel):
    """
    Leave balance model for tracking user leave allowances.

    Tracks available and used days for vacation leave.
    """
    LEAVE_TYPE_CHOICES = [
        ('vacation', 'Vacation'),
    ]

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='leave_balances',
        db_index=True
    )
    leave_type = models.CharField(
        max_length=20,
        choices=LEAVE_TYPE_CHOICES
    )
    year = models.IntegerField()
    
    # Balance tracking
    total_days = models.DecimalField(max_digits=5, decimal_places=1, default=0)
    used_days = models.DecimalField(max_digits=5, decimal_places=1, default=0)
    pending_days = models.DecimalField(max_digits=5, decimal_places=1, default=0)

    # Carry-over from previous year (leave only)
    is_carry_over = models.BooleanField(
        default=False,
        db_index=True,
        help_text='True if this balance was carried over from previous year'
    )
    expires_at = models.DateField(
        null=True, blank=True,
        help_text='Carry-over expiry date (e.g. March 31)'
    )
    accrual_start_date = models.DateField(
        null=True, blank=True,
        help_text='Date from which monthly accrual starts (usually hire_date)'
    )

    # Calculated property
    @property
    def available_days(self):
        return self.total_days - self.used_days - self.pending_days

    @property
    def is_expired(self):
        """Check if carry-over balance has expired."""
        if not self.is_carry_over or not self.expires_at:
            return False
        return timezone.localdate() > self.expires_at

    def get_monthly_accrued_days(self, reference_date=None):
        """
        Calculate accrued days based on hire_date.
        Albanian law: 1.8 days per month, always round up.
        """
        from decimal import Decimal, ROUND_UP
        
        if reference_date is None:
            reference_date = timezone.localdate()
        if not self.accrual_start_date:
            return self.total_days  # fallback: full year if no hire date
        # Calculate months between accrual_start_date and reference_date
        start = self.accrual_start_date
        months = (reference_date.year - start.year) * 12 + (reference_date.month - start.month)

        if months < 0:
            months = 0
        else:
            # Count the current month if the employee has reached the hire day
            if reference_date.day >= start.day:
                months += 1

        months = max(0, months)
        # Cap at 12 months for yearly cycle
        months = min(months, 12)
        # Albanian law: 1.8 days per month, always round up
        accrued = Decimal('1.8') * Decimal(months)
        # Always round up to whole days per Albanian law
        rounded = accrued.quantize(Decimal('1'), rounding=ROUND_UP)
        return rounded  # Return Decimal for consistency

    def get_effective_available_days(self):
        """
        Return available days considering carry-over expiry and accrual.
        For carry-over: return 0 if expired.
        For regular: return accrued amount if accrual_start_date set, else total.
        """
        if self.is_carry_over and self.is_expired:
            return 0
        if self.leave_type == 'vacation' and self.accrual_start_date and not self.is_carry_over:
            accrued = self.get_monthly_accrued_days()
            used = self.used_days + self.pending_days
            return max(0, accrued - used)
        return self.available_days
    
    def can_request_days(self, days):
        """Check if user can request specified number of days."""
        return self.available_days >= days

    class Meta:
        db_table = 'leave_balances'
        ordering = ['user', '-year', 'leave_type']
        unique_together = ['user', 'leave_type', 'year', 'is_carry_over']
        indexes = [
            models.Index(fields=['user', 'year']),
            models.Index(fields=['leave_type']),
            models.Index(fields=['is_carry_over']),
            models.Index(fields=['expires_at']),
        ]


class LeaveRequest(BaseModel):
    """
    Leave request model for vacation requests.

    Tracks leave requests with approval workflow and status.
    """
    REQUEST_TYPE_CHOICES = [
        ('vacation', 'Vacation'),
        ('sick', 'Sick Leave'),
    ]

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('cancelled', 'Cancelled'),
    ]

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='leave_requests',
        db_index=True
    )
    request_type = models.CharField(
        max_length=20,
        choices=REQUEST_TYPE_CHOICES
    )
    
    # Date range
    start_date = models.DateField()
    end_date = models.DateField()
    
    # Calculated field — business days only (see count_business_days)
    @property
    def days_requested(self):
        return count_business_days(self.start_date, self.end_date)
    
    # Request details
    reason = models.TextField(blank=True)

    def clean(self):
        super().clean()
        start_date = self.start_date
        end_date = self.end_date
        if isinstance(start_date, str):
            start_date = parse_date(start_date)
        if isinstance(end_date, str):
            end_date = parse_date(end_date)
        if start_date and end_date:
            if end_date < start_date:
                raise ValidationError({'end_date': 'End date must not precede start date.'})
            if count_business_days(start_date, end_date) == 0:
                raise ValidationError({'end_date': 'Leave must include at least one business day.'})
    
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
        related_name='approved_leaves',
        db_index=True
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)

    # Related balance record
    balance = models.ForeignKey(
        LeaveBalance,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='requests',
        db_index=True
    )

    class Meta:
        db_table = 'leave_requests'
        ordering = ['-start_date', '-created_at']
        indexes = [
            models.Index(fields=['user', 'status']),
            models.Index(fields=['start_date']),
            models.Index(fields=['end_date']),
            models.Index(fields=['request_type']),
            models.Index(fields=['status']),
        ]
    
    def __str__(self):
        return f"{self.user.username} - {self.start_date} to {self.end_date} ({self.status})"
    
    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


@receiver(post_save, sender='users.UserProfile')
def auto_create_leave_balance(sender, instance, created, **kwargs):
    """Auto-create current year leave balance when hire_date is set."""
    if not instance.hire_date:
        return
    from django.utils import timezone
    year = timezone.now().year
    user = instance.user
    # Only create if no current year leave balance exists
    if not LeaveBalance.objects.filter(user=user, leave_type='vacation', year=year).exists():
        settings, _ = GlobalSettings.objects.get_or_create(pk=1)
        LeaveBalance.objects.create(
            user=user,
            leave_type='vacation',
            year=year,
            total_days=settings.default_yearly_leave_days,
            accrual_start_date=instance.hire_date,
        )
