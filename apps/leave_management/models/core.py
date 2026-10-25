"""
Leave management app core models.

This module contains models for leave tracking including requests and balance.
"""

from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth.models import User
from django.utils import timezone
from django.utils.dateparse import parse_date
from core.models.abstract import BaseModel
from core.utils.timezone_local import (
    DEFAULT_BUSINESS_TIMEZONE, clear_business_tz_cache, validate_business_timezone,
)
from core.utils.timezone_local import business_today


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


def global_holiday_dates(start_date, end_date) -> set:
    """Dates of global holidays (``calendar IS NULL``) inside the range, one query.

    Pass the result as ``holidays=`` when counting many rows over one window,
    so the count stays one query per window instead of one per row.
    """
    from apps.dashboard.models.calendar import PublicHoliday

    if start_date is None or end_date is None or end_date < start_date:
        return set()
    return set(
        PublicHoliday.objects.filter(
            is_deleted=False, calendar__isnull=True,
            date__gte=start_date, date__lte=end_date,
        ).values_list('date', flat=True)
    )


def count_leave_days(start_date, end_date, holidays=None) -> int:
    """Vacation days: Mon–Fri inclusive, minus global public holidays in range.

    Global = ``PublicHoliday.calendar IS NULL`` (HR-set, shown on every calendar).
    Workspace-only holidays never reduce a vacation balance. Every vacation
    count (validation, deduction, release, serializers, reports) uses this.
    """
    weekdays = count_business_days(start_date, end_date)
    if weekdays == 0:
        return 0
    if holidays is None:
        holidays = global_holiday_dates(start_date, end_date)
    holiday_weekdays = sum(1 for day in holidays if start_date <= day <= end_date and day.weekday() < 5)
    return weekdays - holiday_weekdays


def count_request_days(request_type, start_date, end_date, holidays=None) -> int:
    """Single source for a request's counted days: vacation is holiday-aware, sick is not."""
    if request_type == 'vacation':
        return count_leave_days(start_date, end_date, holidays)
    return count_business_days(start_date, end_date)


def counted_days(row, holidays=None) -> int:
    """Counted days for a ``values()`` row (needs request_type, start/end, days_counted).

    Prefers the frozen snapshot, so report totals match what balances moved.
    """
    if row.get('days_counted') is not None:
        return int(row['days_counted'])
    return count_request_days(row['request_type'], row['start_date'], row['end_date'], holidays)


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
    carry_over_enabled = models.BooleanField(
        default=True,
        help_text='When off, no new carry-over is created at year end (existing carry runs to expiry)'
    )
    carry_over_applied_year = models.PositiveSmallIntegerField(
        null=True, blank=True,
        help_text='Year the year-end carry-over was last applied for (rollover marker)'
    )

    business_timezone = models.CharField(
        max_length=64, default=DEFAULT_BUSINESS_TIMEZONE,
        validators=[validate_business_timezone],
        help_text='IANA time zone that defines the company calendar day (deadlines, month cutoffs, reports)'
    )

    mfa_required = models.BooleanField(
        default=False,
        help_text='When on, every user must sign in with a second factor '
                  '(users without one are walked through enrolment at login)',
    )

    class Meta:
        db_table = 'leave_global_settings'
        constraints = [
            models.CheckConstraint(
                condition=models.Q(pk=1),
                name='leave_global_settings_singleton',
            ),
        ]

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        clear_business_tz_cache()

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
        return business_today() > self.expires_at

    def get_monthly_accrued_days(self, reference_date=None):
        """
        Calculate accrued days based on hire_date.
        Albanian law: 1.8 days per month, always round up.
        """
        from decimal import Decimal, ROUND_UP
        
        if reference_date is None:
            reference_date = business_today()
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
        constraints = [
            models.CheckConstraint(
                condition=models.Q(is_carry_over=False) | models.Q(expires_at__isnull=False),
                name='leave_carry_over_requires_expiry',
            ),
        ]
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
    
    # Counted days, frozen when the request is created or its dates change.
    # Balance moves (approve/reject/release) read this snapshot, so a holiday
    # added later can never make a release subtract a different amount.
    days_counted = models.DecimalField(
        max_digits=5, decimal_places=1, null=True, blank=True,
        help_text='Counted days snapshot (holiday-aware for vacation)',
    )

    @property
    def days_requested(self):
        if self.days_counted is not None:
            return int(self.days_counted)
        return count_request_days(self.request_type, self.start_date, self.end_date)

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
            if count_request_days(self.request_type, start_date, end_date) == 0:
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
    submitted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    # Related balance record (current-year row for vacation)
    balance = models.ForeignKey(
        LeaveBalance,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='requests',
        db_index=True
    )
    # Carry-over part of the request: days up to the carry expiry, drawn first.
    # Invariant: carry_days + current days == days_counted.
    carry_balance = models.ForeignKey(
        LeaveBalance,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='carry_requests',
        db_index=True
    )
    carry_days = models.DecimalField(max_digits=5, decimal_places=1, default=Decimal('0'))

    class Meta:
        db_table = 'leave_requests'
        ordering = ['-start_date', '-created_at']
        indexes = [
            models.Index(fields=['user', 'status']),
            models.Index(fields=['status', 'start_date']),
            models.Index(fields=['user', 'start_date']),
            models.Index(fields=['start_date']),
            models.Index(fields=['end_date']),
            models.Index(fields=['request_type']),
            models.Index(fields=['status']),
            models.Index(fields=['-created_at', '-id'], name='leave_req_created_idx'),
        ]
    
    def __str__(self):
        return f"{self.user.username} - {self.start_date} to {self.end_date} ({self.status})"
    
    def _parsed_dates(self):
        start = parse_date(self.start_date) if isinstance(self.start_date, str) else self.start_date
        end = parse_date(self.end_date) if isinstance(self.end_date, str) else self.end_date
        return start, end

    def _counted_inputs_changed(self):
        """True when the stored dates or type differ from the in-memory ones."""
        stored = LeaveRequest.objects.filter(pk=self.pk).values_list(
            'start_date', 'end_date', 'request_type'
        ).first()
        return stored is None or stored != (*self._parsed_dates(), self.request_type)

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        inputs_changed = not is_new and self._counted_inputs_changed()
        # Validate dates only when they are new or edited: a row stored before the
        # business-day rule must still be approvable/rejectable (status-only saves).
        if is_new or inputs_changed:
            self.clean()
        if self.days_counted is None or inputs_changed:
            start, end = self._parsed_dates()
            self.days_counted = Decimal(count_request_days(self.request_type, start, end))
        super().save(*args, **kwargs)
        if is_new and self.submitted_at is None:
            self.submitted_at = self.created_at
            super().save(update_fields=['submitted_at'])


@receiver(post_save, sender='users.UserProfile')
def auto_create_leave_balance(sender, instance, created, **kwargs):
    """Auto-create current year leave balance when hire_date is set."""
    if not instance.hire_date:
        return
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
