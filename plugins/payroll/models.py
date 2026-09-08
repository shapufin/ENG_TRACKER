"""
Payroll plugin models.

This plugin owns ONLY payroll-specific data:
- ``PayrollConfiguration`` — operational defaults (singleton).
- ``WageAssignment`` — effective-dated gross monthly wage per user.
- ``PayrollRuleSet`` + ``PayrollTaxBracket`` + ``PayrollContributionRate`` +
  ``PayrollOvertimeCategory`` — versioned, effective-dated Albanian payroll rules.
- ``PayrollWorkCalendar`` + ``PayrollWorkday`` — authoritative work calendar
  for payroll calculations (seeded for Albania 2026).
- ``PayrollRun`` — one monthly payroll run (draft → finalized).
- ``PayrollLine`` — per-user calculation result with immutable snapshot.

It reuses existing ``auth.User``, ``UserProfile``, approved ``OvertimeLog``,
approved ``StandbyLog``, and core team data. It does NOT duplicate users,
teams, overtime, standby, or leave models.
"""
from decimal import Decimal
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils.translation import gettext_lazy as _


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

class PayrollConfiguration(models.Model):
    """Singleton operational configuration for the Payroll plugin."""

    CURRENCY_CHOICES = [
        ('ALL', _('Albanian Lek')),
        ('EUR', _('Euro')),
        ('USD', _('US Dollar')),
    ]
    COUNTRY_CHOICES = [
        ('AL', _('Albania')),
    ]
    ROUNDING_MODE_CHOICES = [
        ('half_up', _('Round half up')),
        ('half_even', _('Round half even (banker)')),
        ('down', _('Round down (truncate)')),
    ]
    MONTHLY_HOURS_STRATEGY_CHOICES = [
        ('fixed_174', _('Fixed 174 hours/month')),
        ('workdays_x8', _('Working days × 8 hours')),
        ('calendar_days', _('Calendar days × 8 hours')),
    ]

    currency = models.CharField(
        _('Currency'), max_length=3, choices=CURRENCY_CHOICES, default='ALL',
    )
    country = models.CharField(
        _('Country'), max_length=2, choices=COUNTRY_CHOICES, default='AL',
    )
    default_tax_profile = models.CharField(
        _('Default Tax Profile'), max_length=30, default='standard',
        help_text=_('Tax profile code applied when a user has no explicit profile.'),
    )
    rounding_mode = models.CharField(
        _('Rounding Mode'), max_length=20,
        choices=ROUNDING_MODE_CHOICES, default='half_up',
    )
    rounding_precision = models.PositiveSmallIntegerField(
        _('Rounding Precision'), default=0,
        validators=[MaxValueValidator(4)],
        help_text=_('Decimal places for final amounts. 0 = whole Lek. Max 4.'),
    )
    weekday_standby_hourly_rate = models.DecimalField(
        _('Weekday Standby Hourly Rate'), max_digits=12, decimal_places=2,
        default=Decimal('0'), validators=[MinValueValidator(Decimal('0'))],
        help_text=_('Lek per hour for standby on weekdays (Mon–Fri).'),
    )
    weekend_standby_hourly_rate = models.DecimalField(
        _('Weekend Standby Hourly Rate'), max_digits=12, decimal_places=2,
        default=Decimal('0'), validators=[MinValueValidator(Decimal('0'))],
        help_text=_('Lek per hour for standby on weekends (Sat–Sun). '
                    'Holidays use the weekday rate.'),
    )
    monthly_hours_strategy = models.CharField(
        _('Monthly Hours Strategy'), max_length=20,
        choices=MONTHLY_HOURS_STRATEGY_CHOICES, default='fixed_174',
    )
    default_workday_hours = models.DecimalField(
        _('Default Workday Hours'), max_digits=5, decimal_places=2,
        default=Decimal('8'), validators=[MinValueValidator(Decimal('0'))],
    )
    only_approved_entries = models.BooleanField(
        _('Only Approved Entries'), default=True,
        help_text=_('If true, only approved overtime/standby are included in payroll.'),
    )
    require_tl_closed_before_finalize = models.BooleanField(
        _('Require TL Closure Before Finalize'), default=False,
        help_text=_('If true, all payroll users must have a TL-closed approval period.'),
    )
    overtime_is_taxable = models.BooleanField(
        _('Overtime Is Taxable'), default=True,
    )
    standby_is_taxable = models.BooleanField(
        _('Standby Is Taxable'), default=True,
    )
    overtime_is_contribution_bearing = models.BooleanField(
        _('Overtime Is Contribution-Bearing'), default=True,
    )
    standby_is_contribution_bearing = models.BooleanField(
        _('Standby Is Contribution-Bearing'), default=True,
    )
    missing_timestamp_fallback_category = models.CharField(
        _('Missing Timestamp Fallback Category'), max_length=30,
        default='weekday_day',
        help_text=_('Overtime category used when start/end times are missing.'),
    )
    organization_name = models.CharField(
        _('Organization Name'), max_length=200, blank=True,
    )
    payslip_footer = models.TextField(
        _('Payslip Footer'), blank=True,
        help_text=_('Optional text shown at the bottom of payslip PDFs.'),
    )
    rules_source_label = models.CharField(
        _('Rules Source Label'), max_length=200, blank=True,
        help_text=_('Human-readable label for the rule source, e.g. "Boshti reference 2026".'),
    )
    rules_validation_status = models.CharField(
        _('Rules Validation Status'), max_length=30, default='reference',
        help_text=_('Status of rule validation: reference, verified, official.'),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('Payroll Configuration')
        verbose_name_plural = _('Payroll Configuration')
        constraints = [
            models.CheckConstraint(
                condition=models.Q(pk=1),
                name='payroll_configuration_singleton',
            ),
        ]

    def __str__(self):
        return f'Payroll Configuration ({self.currency})'

    @classmethod
    def get_singleton(cls):
        obj, _ = cls.objects.get_or_create(pk=1, defaults={})
        return obj


# ---------------------------------------------------------------------------
# Wage assignments
# ---------------------------------------------------------------------------

class WageAssignment(models.Model):
    """Effective-dated gross monthly wage for a user.

    One user may have multiple non-overlapping wage records. The payroll
    calculator resolves exactly one applicable wage for a given month.
    A missing or ambiguous wage produces a validation error, never a
    zero-wage payroll row.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='wage_assignments',
        help_text=_('Employee receiving this gross monthly wage.'),
    )
    gross_monthly_wage = models.DecimalField(
        _('Gross Monthly Wage'), max_digits=12, decimal_places=2,
        validators=[MinValueValidator(Decimal('0'))],
        help_text=_('Gross monthly wage in the configured currency (Lek).'),
    )
    effective_from = models.DateField(_('Effective From'), db_index=True)
    effective_to = models.DateField(
        _('Effective To'), blank=True, null=True, db_index=True,
        help_text=_('Leave blank for an open-ended wage. Must be ≥ effective_from.'),
    )
    note = models.CharField(_('Note'), max_length=255, blank=True)
    is_active = models.BooleanField(_('Active'), default=True, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name='created_wage_assignments',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name='updated_wage_assignments',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('Wage Assignment')
        verbose_name_plural = _('Wage Assignments')
        ordering = ['user__username', '-effective_from']
        indexes = [
            models.Index(fields=['user', 'effective_from']),
            models.Index(fields=['user', 'effective_to']),
            models.Index(fields=['is_active']),
        ]
        constraints = [
            # Backstop: prevents two active wages with the same start date
            # for the same user. Full period-overlap exclusion is enforced in
            # the serializer and resolve_for_month; this DB constraint catches
            # direct DB writes or bulk imports that bypass application logic.
            models.UniqueConstraint(
                fields=['user', 'effective_from'],
                condition=models.Q(is_active=True),
                name='wage_assignment_unique_active_start_per_user',
            ),
        ]

    def __str__(self):
        return f'{self.user.username} — {self.gross_monthly_wage} (from {self.effective_from})'

    def clean(self):
        super().clean()
        if self.effective_to and self.effective_from and self.effective_to < self.effective_from:
            raise ValidationError({'effective_to': _('Effective to must be on or after effective from.')})
        if self.gross_monthly_wage is not None and self.gross_monthly_wage < 0:
            raise ValidationError({'gross_monthly_wage': _('Wage cannot be negative.')})

    @classmethod
    def resolve_for_month(cls, user, year, month):
        """Return the single applicable wage assignment for a user/month.

        Raises ``ValidationError`` if zero or multiple wages apply.
        """
        from datetime import date, timedelta
        month_start = date(year, month, 1)
        if month == 12:
            month_end = date(year, 12, 31)
        else:
            month_end = date(year, month + 1, 1) - timedelta(days=1)

        candidates = cls.objects.filter(
            user=user,
            is_active=True,
            effective_from__lte=month_end,
        ).filter(
            models.Q(effective_to__isnull=True) | models.Q(effective_to__gte=month_start),
        ).order_by('-effective_from')

        if not candidates.exists():
            raise ValidationError(
                _('No active wage assignment for %(user)s in %(year)s-%(month)02d.') % {
                    'user': getattr(user, 'username', str(user)),
                    'year': year, 'month': month,
                }
            )
        if candidates.count() > 1:
            raise ValidationError(
                _('Multiple overlapping wage assignments for %(user)s in %(year)s-%(month)02d. '
                  'Ensure wage assignments do not overlap.') % {
                    'user': getattr(user, 'username', str(user)),
                    'year': year, 'month': month,
                }
            )
        return candidates.first()


# ---------------------------------------------------------------------------
# Rule sets and structured rules
# ---------------------------------------------------------------------------

class PayrollRuleSet(models.Model):
    """Effective-dated, named, versioned set of payroll rules.

    The calculator resolves the applicable rule set for a payroll period
    by effective date. All rules (brackets, contributions, overtime
    categories) reference this set.
    """

    TAX_PROFILE_CHOICES = [
        ('standard', _('Standard employee')),
        ('category_6', _('Category 6 (reserved)')),
        ('category_7', _('Category 7 (reserved)')),
    ]

    code = models.CharField(_('Code'), max_length=50, unique=True)
    name = models.CharField(_('Name'), max_length=200)
    version = models.CharField(_('Version'), max_length=20, default='1.0')
    country = models.CharField(_('Country'), max_length=2, default='AL')
    effective_from = models.DateField(_('Effective From'), db_index=True)
    effective_to = models.DateField(
        _('Effective To'), blank=True, null=True, db_index=True,
    )
    is_active = models.BooleanField(_('Active'), default=True, db_index=True)
    tax_profile = models.CharField(
        _('Tax Profile'), max_length=30, choices=TAX_PROFILE_CHOICES, default='standard',
    )
    source = models.CharField(_('Source'), max_length=200, blank=True)
    notes = models.TextField(_('Notes'), blank=True)
    validation_status = models.CharField(
        _('Validation Status'), max_length=30, default='reference',
        help_text=_('reference, verified, or official.'),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('Payroll Rule Set')
        verbose_name_plural = _('Payroll Rule Sets')
        ordering = ['-effective_from']
        indexes = [
            models.Index(fields=['effective_from', 'effective_to']),
            models.Index(fields=['is_active', 'effective_from']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['country', 'tax_profile', 'effective_from'],
                condition=models.Q(is_active=True),
                name='payroll_ruleset_unique_active_effective_date',
            ),
        ]

    def __str__(self):
        return f'{self.name} v{self.version} ({self.effective_from})'

    @classmethod
    def has_active_effective_date_conflict(
        cls, country, tax_profile, effective_from, exclude_pk=None,
    ):
        queryset = cls.objects.filter(
            country=country,
            tax_profile=tax_profile,
            effective_from=effective_from,
            is_active=True,
        )
        if exclude_pk is not None:
            queryset = queryset.exclude(pk=exclude_pk)
        return queryset.exists()

    @classmethod
    def resolve_for_date(cls, target_date, tax_profile='standard'):
        """Return the active rule set effective on ``target_date``."""
        candidates = cls.objects.filter(
            is_active=True,
            tax_profile=tax_profile,
            effective_from__lte=target_date,
        ).filter(
            models.Q(effective_to__isnull=True) | models.Q(effective_to__gte=target_date),
        ).order_by('-effective_from', '-pk')
        return candidates.first()


class PayrollTaxBracket(models.Model):
    """Progressive tax bracket within a rule set.

    Ordered by ``lower_bound``. ``upper_bound`` null = no cap.
    ``rate`` is a fraction (0.13 = 13%). ``fixed_amount`` is a Lek
    amount added for brackets that use a fixed-plus-rate structure.
    """

    rule_set = models.ForeignKey(
        PayrollRuleSet, on_delete=models.CASCADE, related_name='tax_brackets',
    )
    lower_bound = models.DecimalField(
        _('Lower Bound'), max_digits=12, decimal_places=2, default=Decimal('0'),
        help_text=_('Monthly taxable income lower bound (Lek).'),
    )
    upper_bound = models.DecimalField(
        _('Upper Bound'), max_digits=12, decimal_places=2, null=True, blank=True,
        help_text=_('Null = no upper cap.'),
    )
    rate = models.DecimalField(
        _('Rate'), max_digits=6, decimal_places=4, default=Decimal('0'),
        help_text=_('Tax rate as a fraction (0.13 = 13%).'),
    )
    fixed_amount = models.DecimalField(
        _('Fixed Amount'), max_digits=12, decimal_places=2, default=Decimal('0'),
        help_text=_('Fixed Lek amount added for this bracket.'),
    )
    order = models.PositiveSmallIntegerField(_('Order'), default=0)

    class Meta:
        verbose_name = _('Payroll Tax Bracket')
        verbose_name_plural = _('Payroll Tax Brackets')
        ordering = ['rule_set', 'order', 'lower_bound']
        indexes = [models.Index(fields=['rule_set'])]

    def __str__(self):
        return f'{self.lower_bound}–{self.upper_bound or "∞"} @ {self.rate}'


class PayrollContributionRate(models.Model):
    """Social/health contribution rate within a rule set.

    ``side`` distinguishes employee vs employer. ``rate`` is a fraction.
    ``cap`` and ``floor`` bound the contribution base.
    """

    SIDE_CHOICES = [
        ('employee', _('Employee')),
        ('employer', _('Employer')),
    ]
    TYPE_CHOICES = [
        ('social', _('Social security')),
        ('health', _('Health insurance')),
    ]

    rule_set = models.ForeignKey(
        PayrollRuleSet, on_delete=models.CASCADE, related_name='contribution_rates',
    )
    contribution_type = models.CharField(
        _('Type'), max_length=10, choices=TYPE_CHOICES,
    )
    side = models.CharField(_('Side'), max_length=10, choices=SIDE_CHOICES)
    rate = models.DecimalField(
        _('Rate'), max_digits=6, decimal_places=4, default=Decimal('0'),
        help_text=_('Fraction (0.095 = 9.5%).'),
    )
    cap = models.DecimalField(
        _('Cap'), max_digits=12, decimal_places=2, null=True, blank=True,
        help_text=_('Maximum monthly contribution base (Lek). Applied per month, '
                    'not annualized. Null = no cap.'),
    )
    floor = models.DecimalField(
        _('Floor'), max_digits=12, decimal_places=2, null=True, blank=True,
        help_text=_('Minimum monthly contribution base (Lek). Null = no floor.'),
    )

    def clean(self):
        super().clean()
        if self.cap is not None and self.floor is not None and self.cap < self.floor:
            raise ValidationError({'cap': _('Cap must be greater than or equal to floor.')})

    class Meta:
        verbose_name = _('Payroll Contribution Rate')
        verbose_name_plural = _('Payroll Contribution Rates')
        ordering = ['rule_set', 'contribution_type', 'side']
        indexes = [models.Index(fields=['rule_set', 'contribution_type', 'side'])]
        constraints = [
            models.UniqueConstraint(
                fields=['rule_set', 'contribution_type', 'side'],
                name='payroll_contribution_unique_per_set_type_side',
            ),
        ]

    def __str__(self):
        return f'{self.get_contribution_type_display()} {self.side} @ {self.rate}'


class PayrollOvertimeCategory(models.Model):
    """Overtime classification and multiplier within a rule set.

    Categories are matched by date/weekday/holiday and optional time
    windows. ``multiplier`` is applied to the base hourly rate.
    """

    CODE_CHOICES = [
        ('weekday_day', _('Weekday daytime')),
        ('weekday_night', _('Weekday night')),
        ('weekend_day', _('Weekend daytime')),
        ('weekend_night', _('Weekend night')),
        ('holiday', _('Public holiday')),
    ]

    rule_set = models.ForeignKey(
        PayrollRuleSet, on_delete=models.CASCADE, related_name='overtime_categories',
    )
    code = models.CharField(_('Code'), max_length=30, choices=CODE_CHOICES)
    multiplier = models.DecimalField(
        _('Multiplier'), max_digits=5, decimal_places=2, default=Decimal('1.25'),
        help_text=_('Multiplier applied to base hourly rate (1.25 = 125%).'),
    )
    night_start_hour = models.PositiveSmallIntegerField(null=True, blank=True)
    night_end_hour = models.PositiveSmallIntegerField(null=True, blank=True)
    applies_weekend = models.BooleanField(default=False)
    applies_holiday = models.BooleanField(default=False)
    order = models.PositiveSmallIntegerField(_('Order'), default=0)

    class Meta:
        verbose_name = _('Payroll Overtime Category')
        verbose_name_plural = _('Payroll Overtime Categories')
        ordering = ['rule_set', 'order', 'code']
        indexes = [models.Index(fields=['rule_set'])]
        constraints = [
            models.UniqueConstraint(
                fields=['rule_set', 'code'],
                name='payroll_overtime_category_unique_per_set_code',
            ),
        ]

    def __str__(self):
        return f'{self.get_code_display()} ×{self.multiplier}'


# ---------------------------------------------------------------------------
# Work calendar
# ---------------------------------------------------------------------------

class PayrollWorkCalendar(models.Model):
    """Year/country header for the Payroll work calendar."""

    country = models.CharField(_('Country'), max_length=2, default='AL')
    year = models.PositiveSmallIntegerField(_('Year'), db_index=True)
    is_active = models.BooleanField(_('Active'), default=True, db_index=True)
    source = models.CharField(_('Source'), max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('Payroll Work Calendar')
        verbose_name_plural = _('Payroll Work Calendars')
        ordering = ['-year']
        indexes = [models.Index(fields=['country', 'year'])]
        constraints = [
            models.UniqueConstraint(
                fields=['country', 'year'],
                name='payroll_work_calendar_country_year_unique',
            ),
        ]

    def __str__(self):
        return f'{self.country} {self.year}'


class PayrollWorkday(models.Model):
    """Per-date workday definition within a Payroll work calendar.

    ``is_working_day`` = False marks weekends and holidays. ``holiday_name``
    is set for public holidays. ``standard_hours`` is the expected work
    hours for that day (0 for non-working days).
    """

    calendar = models.ForeignKey(
        PayrollWorkCalendar, on_delete=models.CASCADE, related_name='workdays',
    )
    date = models.DateField(_('Date'), db_index=True)
    is_working_day = models.BooleanField(_('Working Day'), default=True, db_index=True)
    is_holiday = models.BooleanField(_('Holiday'), default=False, db_index=True)
    holiday_name = models.CharField(_('Holiday Name'), max_length=150, blank=True)
    standard_hours = models.DecimalField(
        _('Standard Hours'), max_digits=5, decimal_places=2, default=Decimal('8'),
    )
    override_note = models.CharField(_('Override Note'), max_length=255, blank=True)

    class Meta:
        verbose_name = _('Payroll Workday')
        verbose_name_plural = _('Payroll Workdays')
        ordering = ['date']
        indexes = [
            models.Index(fields=['calendar', 'date']),
            models.Index(fields=['date', 'is_working_day']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['calendar', 'date'],
                name='payroll_workday_calendar_date_unique',
            ),
        ]

    def __str__(self):
        flag = 'holiday' if self.is_holiday else ('work' if self.is_working_day else 'off')
        return f'{self.date} ({flag})'


# ---------------------------------------------------------------------------
# Payroll runs and lines
# ---------------------------------------------------------------------------

class PayrollRun(models.Model):
    """One monthly payroll run.

    Status flow: draft → finalized (or cancelled). A finalized run is
    immutable; corrections require a new run or a reversal relationship.
    """

    STATUS_CHOICES = [
        ('draft', _('Draft')),
        ('finalized', _('Finalized')),
        ('cancelled', _('Cancelled')),
    ]

    year = models.PositiveSmallIntegerField(_('Year'), db_index=True)
    month = models.PositiveSmallIntegerField(_('Month'), db_index=True)
    status = models.CharField(
        _('Status'), max_length=20, choices=STATUS_CHOICES, default='draft', db_index=True,
    )
    rule_set = models.ForeignKey(
        PayrollRuleSet, on_delete=models.PROTECT, related_name='runs',
        help_text=_('Rule set snapshot used for this run.'),
    )
    configuration_snapshot = models.JSONField(
        _('Configuration Snapshot'), default=dict, editable=False,
        help_text=_('PayrollConfiguration values captured at generation time.'),
    )
    totals = models.JSONField(
        _('Totals'), default=dict, blank=True,
        help_text=_('Run-level totals: gross, deductions, net, employer cost.'),
    )
    notes = models.TextField(_('Notes'), blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name='created_payroll_runs',
    )
    finalized_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name='finalized_payroll_runs',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    finalized_at = models.DateTimeField(_('Finalized At'), null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('Payroll Run')
        verbose_name_plural = _('Payroll Runs')
        ordering = ['-year', '-month']
        indexes = [
            models.Index(fields=['year', 'month']),
            models.Index(fields=['status']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['year', 'month'],
                condition=models.Q(status__in=['draft', 'finalized']),
                name='payroll_run_one_active_per_period',
            ),
        ]

    def __str__(self):
        return f'Payroll {self.year}-{self.month:02d} ({self.status})'

    @property
    def period_label(self):
        return f'{self.year}-{self.month:02d}'


class PayrollRunEntry(models.Model):
    """Relational source-entry inclusion snapshot for one PayrollRun."""

    STATUS_CHOICES = [
        ('draft', _('Draft')),
        ('finalized', _('Finalized')),
        ('reversed', _('Reversed')),
    ]
    SOURCE_KIND_CHOICES = [
        ('overtime', _('Overtime')),
        ('standby', _('Standby')),
    ]

    run = models.ForeignKey(
        PayrollRun, on_delete=models.CASCADE, related_name='source_entries',
    )
    line = models.ForeignKey(
        'PayrollLine', on_delete=models.CASCADE, related_name='source_entries',
    )
    source_kind = models.CharField(max_length=20, choices=SOURCE_KIND_CHOICES)
    source_id = models.PositiveBigIntegerField()
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    work_date = models.DateField()
    requested_period = models.DateField()
    resolved_period = models.DateField()
    hours = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal('0'))
    overtime_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    standby_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    source_status = models.CharField(max_length=20, default='approved')
    resolution_reason = models.CharField(max_length=40, default='normal')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft', db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    finalized_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = _('Payroll Run Entry')
        verbose_name_plural = _('Payroll Run Entries')
        ordering = ['run', 'user__username', 'work_date', 'source_kind', 'source_id']
        indexes = [
            models.Index(fields=['source_kind', 'source_id', 'status']),
            models.Index(fields=['run', 'status']),
            models.Index(fields=['user', 'resolved_period']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['run', 'source_kind', 'source_id'],
                name='payroll_run_source_entry_unique',
            ),
            models.UniqueConstraint(
                fields=['source_kind', 'source_id'],
                condition=models.Q(status='finalized'),
                name='payroll_finalized_source_unique',
            ),
        ]

    def save(self, *args, **kwargs):
        """Keep finalized inclusion snapshots immutable.

        The only permitted update after creation is the draft-to-finalized
        transition performed by ``_finalize_run_entries`` while its run is
        still draft and locked by the finalization transaction.
        """
        if self._state.adding:
            run_status = PayrollRun.objects.only('status').get(pk=self.run_id).status
            if run_status == 'finalized':
                raise ValidationError('Payroll run entries cannot be created in a finalized run.')
        else:
            previous = type(self).objects.get(pk=self.pk)
            previous_run_status = PayrollRun.objects.only('status').get(pk=previous.run_id).status
            if previous.status == 'finalized' or previous_run_status == 'finalized':
                raise ValidationError('Finalized payroll run entries are immutable.')
            if self.status == 'finalized':
                run_status = PayrollRun.objects.only('status').get(pk=self.run_id).status
                transition_fields = {'status', 'finalized_at', 'source_status'}
                changed_fields = {
                    field.name for field in self._meta.concrete_fields
                    if getattr(previous, field.attname) != getattr(self, field.attname)
                }
                if (
                    previous.status != 'draft'
                    or previous.run_id != self.run_id
                    or run_status != 'draft'
                    or not changed_fields <= transition_fields
                ):
                    raise ValidationError('Finalized payroll run entries are immutable.')
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        """Prevent deletion of finalized inclusion snapshots."""
        previous = type(self).objects.get(pk=self.pk)
        run_status = PayrollRun.objects.only('status').get(pk=previous.run_id).status
        if previous.status == 'finalized' or run_status == 'finalized':
            raise ValidationError('Finalized payroll run entries are immutable.')
        return super().delete(*args, **kwargs)

    @property
    def is_carryover(self):
        return self.requested_period != self.work_date.replace(day=1)


class PayrollLine(models.Model):
    """Per-user payroll calculation result within a run.

    Finalized lines are immutable. Draft lines can be regenerated.
    All numeric fields are Decimal Lek amounts unless noted.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='payroll_lines',
    )
    run = models.ForeignKey(
        PayrollRun, on_delete=models.CASCADE, related_name='lines',
    )
    wage_assignment = models.ForeignKey(
        WageAssignment, on_delete=models.PROTECT, null=True, blank=True,
        related_name='payroll_lines',
        help_text=_('Wage assignment snapshot used for this line.'),
    )

    # Input snapshot
    gross_monthly_wage = models.DecimalField(
        _('Gross Monthly Wage'), max_digits=12, decimal_places=2, default=Decimal('0'),
    )
    monthly_working_days = models.PositiveSmallIntegerField(_('Monthly Working Days'), default=0)
    monthly_standard_hours = models.DecimalField(
        _('Monthly Standard Hours'), max_digits=8, decimal_places=2, default=Decimal('0'),
    )
    overtime_hours = models.DecimalField(
        _('Overtime Hours'), max_digits=8, decimal_places=2, default=Decimal('0'),
    )
    overtime_amount = models.DecimalField(
        _('Overtime Amount'), max_digits=12, decimal_places=2, default=Decimal('0'),
    )
    standby_hours = models.DecimalField(
        _('Standby Hours'), max_digits=8, decimal_places=2, default=Decimal('0'),
    )
    standby_amount = models.DecimalField(
        _('Standby Amount'), max_digits=12, decimal_places=2, default=Decimal('0'),
    )

    # Calculated amounts
    total_gross = models.DecimalField(
        _('Total Gross'), max_digits=12, decimal_places=2, default=Decimal('0'),
    )
    taxable_base = models.DecimalField(
        _('Taxable Base'), max_digits=12, decimal_places=2, default=Decimal('0'),
    )
    contribution_base = models.DecimalField(
        _('Contribution Base'), max_digits=12, decimal_places=2, default=Decimal('0'),
    )
    employee_social = models.DecimalField(
        _('Employee Social'), max_digits=12, decimal_places=2, default=Decimal('0'),
    )
    employee_health = models.DecimalField(
        _('Employee Health'), max_digits=12, decimal_places=2, default=Decimal('0'),
    )
    income_tax = models.DecimalField(
        _('Income Tax'), max_digits=12, decimal_places=2, default=Decimal('0'),
    )
    total_employee_deductions = models.DecimalField(
        _('Total Employee Deductions'), max_digits=12, decimal_places=2, default=Decimal('0'),
    )
    net_pay = models.DecimalField(
        _('Net Pay'), max_digits=12, decimal_places=2, default=Decimal('0'),
    )
    employer_social = models.DecimalField(
        _('Employer Social'), max_digits=12, decimal_places=2, default=Decimal('0'),
    )
    employer_health = models.DecimalField(
        _('Employer Health'), max_digits=12, decimal_places=2, default=Decimal('0'),
    )
    total_employer_cost = models.DecimalField(
        _('Total Employer Cost'), max_digits=12, decimal_places=2, default=Decimal('0'),
    )

    # Metadata
    overtime_breakdown = models.JSONField(
        _('Overtime Breakdown'), default=dict, blank=True,
        help_text=_('Per-category overtime hours and amounts.'),
    )
    carryover_breakdown = models.JSONField(
        _('Carryover Breakdown'), default=dict, blank=True,
        help_text=_('Regular and carried overtime/standby source-period details.'),
    )
    calculation_trace = models.JSONField(
        _('Calculation Trace'), default=dict, blank=True,
        help_text=_('Detailed calculation steps for audit.'),
    )
    warnings = models.JSONField(
        _('Warnings'), default=list, blank=True,
        help_text=_('List of calculation warnings (missing timestamps, fallbacks, etc.).'),
    )
    rule_set_version = models.CharField(_('Rule Set Version'), max_length=20, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('Payroll Line')
        verbose_name_plural = _('Payroll Lines')
        ordering = ['run', 'user__username']
        indexes = [
            models.Index(fields=['run', 'user']),
            models.Index(fields=['user']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['run', 'user'],
                name='payroll_line_run_user_unique',
            ),
        ]

    def save(self, *args, **kwargs):
        """Prevent creation or updates once the owning payroll run is finalized."""
        run_status = PayrollRun.objects.only('status').get(pk=self.run_id).status
        if run_status == 'finalized':
            raise ValidationError('Payroll lines belonging to a finalized run are immutable.')
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        """Prevent deletion once the owning payroll run is finalized."""
        run_status = PayrollRun.objects.only('status').get(pk=self.run_id).status
        if run_status == 'finalized':
            raise ValidationError('Payroll lines belonging to a finalized run are immutable.')
        return super().delete(*args, **kwargs)

    def __str__(self):
        return f'{self.user.username} — {self.run.period_label} — net {self.net_pay}'
