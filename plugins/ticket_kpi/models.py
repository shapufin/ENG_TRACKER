from django.db import models
from django.contrib.auth.models import User
from django.core.validators import FileExtensionValidator

from apps.overtime.models.core import Client


class ExportProfile(models.Model):
    """
    Admin-configured mapping profile for ticket exports.
    One profile per client/system type. Users are assigned a profile
    based on their client's assigned profile, or use the global default.
    """
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    # Core mapping: our_field -> their_column_name
    # Example: {"ticket_id": "Number", "title": "Short description", "status": "State"}
    field_mapping = models.JSONField(
        default=dict,
        help_text="Map our normalized fields to the user's export column names"
    )

    # Value transforms: our_field -> {their_value -> our_value}
    # Example: {"status": {"Resolved": "closed", "In Progress": "open"}}
    value_transforms = models.JSONField(
        default=dict,
        help_text="Transform raw values to normalized values per field"
    )

    # Which of our fields are required vs optional
    # Example: ["ticket_id", "title", "status", "created_at"]
    required_fields = models.JSONField(
        default=list,
        help_text="List of our field names that must be present in every upload"
    )

    # Computed field toggles
    compute_resolution_time = models.BooleanField(
        default=True,
        help_text="Auto-calculate time_to_resolution_hours from created_at and resolved_at"
    )
    compute_sla = models.BooleanField(
        default=False,
        help_text="Auto-determine sla_breached from SLA column or resolution time"
    )

    # Assignment
    is_global = models.BooleanField(
        default=False,
        help_text="If true, this profile is available to all users as a fallback"
    )
    assigned_clients = models.ManyToManyField(
        Client,
        blank=True,
        related_name='export_profiles',
        help_text="Clients that can use this profile (empty = unrestricted)"
    )

    # Audit
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_ticket_profiles'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Export Profile'
        verbose_name_plural = 'Export Profiles'
        constraints = [
            models.UniqueConstraint(fields=['name'], name='export_profile_name_unique'),
        ]

    def __str__(self):
        return self.name


class TicketImportBatch(models.Model):
    """
    One user upload for a specific month.
    Contains the raw file and metadata. The parsed tickets live in NormalizedTicket.
    """
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='ticket_import_batches'
    )
    month = models.DateField(
        help_text="First day of the month this upload represents"
    )
    profile = models.ForeignKey(
        ExportProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='import_batches'
    )

    # Clients this upload applies to (multiple allowed)
    clients = models.ManyToManyField(
        Client,
        blank=True,
        related_name='ticket_import_batches'
    )

    # What columns were detected in the uploaded file
    detected_columns = models.JSONField(
        default=list,
        help_text="List of column names found in the uploaded file"
    )

    # Auto-detected mapping from our canonical fields to their columns
    detected_field_map = models.JSONField(
        default=dict,
        help_text="Map of canonical field -> detected column name"
    )

    raw_file = models.FileField(
        upload_to='ticket_imports/%Y/%m/',
        validators=[
            FileExtensionValidator(allowed_extensions=['csv', 'xlsx', 'xls'])
        ],
        help_text="Original uploaded file (CSV or Excel)"
    )
    record_count = models.PositiveIntegerField(
        default=0,
        help_text="Number of successfully parsed records"
    )

    # Override tracking
    is_overridden = models.BooleanField(
        default=False,
        help_text="Set to true when user re-uploads for the same month"
    )
    overridden_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='overridden_ticket_batches'
    )
    overridden_at = models.DateTimeField(null=True, blank=True)

    # Review tracking (TL/Admin can mark a batch as reviewed; reviewed batches
    # can no longer be deleted by the owner unless unreviewed first).
    reviewed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_ticket_batches'
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-month']
        verbose_name = 'Ticket Import Batch'
        verbose_name_plural = 'Ticket Import Batches'
        indexes = [
            models.Index(fields=['user', 'month']),
            models.Index(fields=['profile']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'month'],
                condition=models.Q(is_overridden=False),
                name='unique_active_upload_per_month'
            )
        ]

    def __str__(self):
        return f"{self.user.username} - {self.month.strftime('%Y-%m')} ({self.record_count} tickets)"


class NormalizedTicket(models.Model):
    """
    A single ticket record, normalized from the user's export file.
    Only ticket_id, title, status, created_at are required.
    Everything else is nullable — the system gracefully handles partial data.
    """
    batch = models.ForeignKey(
        TicketImportBatch,
        on_delete=models.CASCADE,
        related_name='tickets'
    )

    # Row index for traceability back to the source file
    row_index = models.PositiveIntegerField(
        default=0,
        help_text="Original row number in the uploaded file"
    )

    # Auto-detected standard fields — populated when possible, but not required.
    # The raw_data JSONField below is the primary source of truth for all ticket data.
    ticket_id = models.CharField(max_length=200, blank=True, db_index=True)
    title = models.TextField(blank=True)
    status = models.CharField(max_length=100, blank=True, db_index=True)
    created_at = models.DateTimeField(null=True, blank=True, db_index=True)
    resolved_at = models.DateTimeField(null=True, blank=True, db_index=True)
    assignee = models.CharField(max_length=200, blank=True, db_index=True)
    requester = models.CharField(max_length=200, blank=True)
    priority = models.CharField(max_length=100, blank=True, db_index=True)
    category = models.CharField(max_length=200, blank=True, db_index=True)

    # Computed fields (populated when dates are detectable)
    time_to_resolution_hours = models.FloatField(
        null=True,
        blank=True,
        help_text="Hours between created_at and resolved_at"
    )
    sla_breached = models.BooleanField(
        null=True,
        blank=True,
        help_text="True if SLA was breached (from export column or computed)"
    )

    # PRIMARY SOURCE OF TRUTH: every column from the uploaded file is stored here.
    # Standard fields above are extracted for fast filtering/indexing when auto-detected.
    raw_data = models.JSONField(
        default=dict,
        help_text="Complete row data from the uploaded file (all columns)"
    )

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Normalized Ticket'
        verbose_name_plural = 'Normalized Tickets'
        indexes = [
            models.Index(fields=['batch', 'status']),
            models.Index(fields=['batch', 'category']),
            models.Index(fields=['batch', 'priority']),
            models.Index(fields=['batch', 'assignee']),
        ]

    def __str__(self):
        return f"{self.ticket_id}: {self.title[:50]}"


class TicketOvertimeLink(models.Model):
    """Link an overtime entry to a normalized KPI ticket.

    This reverse relationship is for KPI internals only. Overtime code must
    not use ``ot.ticket_links`` because the accessor disappears if KPI is
    uninstalled.
    """
    overtime_log = models.ForeignKey(
        'overtime.OvertimeLog',
        on_delete=models.CASCADE,
        related_name='ticket_links',
    )
    normalized_ticket = models.ForeignKey(
        NormalizedTicket,
        on_delete=models.CASCADE,
        related_name='overtime_links',
    )
    linked_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='ticket_links_created',
    )
    linked_at = models.DateTimeField(auto_now_add=True)
    link_method = models.CharField(
        max_length=10,
        choices=[('manual', 'Manual'), ('auto', 'Auto')],
        default='manual',
    )
    review_status = models.CharField(
        max_length=10,
        choices=[
            ('confirmed', 'Confirmed'),
            ('pending', 'Pending'),
            ('rejected', 'Rejected'),
        ],
        default='confirmed',
    )
    reviewed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='ticket_links_reviewed',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    note = models.TextField(blank=True)

    class Meta:
        db_table = 'ticket_kpi_overtime_links'
        ordering = ['-linked_at']
        constraints = [
            models.UniqueConstraint(
                fields=['overtime_log', 'normalized_ticket'],
                name='unique_ticket_overtime_link',
            ),
        ]
        indexes = [
            models.Index(fields=['review_status']),
            models.Index(fields=['link_method']),
        ]

    def __str__(self):
        return f"OT#{self.overtime_log_id} ↔ Ticket#{self.normalized_ticket_id}"


class MonthlyKPI(models.Model):
    """
    Pre-computed KPIs per user per month.
    Updated automatically by signals when a TicketImportBatch is saved/deleted.
    This makes dashboard queries fast — no aggregation at read time.
    """
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='ticket_kpis'
    )
    month = models.DateField(
        help_text="First day of the month"
    )

    # Volume metrics
    total_tickets = models.PositiveIntegerField(default=0)
    closed_tickets = models.PositiveIntegerField(default=0)
    open_tickets = models.PositiveIntegerField(default=0)

    # Time metrics
    avg_resolution_hours = models.FloatField(
        null=True,
        blank=True,
        help_text="Average resolution time in hours (excludes unresolved)"
    )
    min_resolution_hours = models.FloatField(null=True, blank=True)
    max_resolution_hours = models.FloatField(null=True, blank=True)

    # Percentile resolution times — more robust than avg (resistant to outliers)
    p50_resolution_hours = models.FloatField(
        null=True, blank=True,
        help_text="Median (p50) resolution time in hours"
    )
    p75_resolution_hours = models.FloatField(
        null=True, blank=True,
        help_text="75th percentile resolution time in hours"
    )
    p90_resolution_hours = models.FloatField(
        null=True, blank=True,
        help_text="90th percentile resolution time in hours"
    )

    # SLA metrics
    sla_compliance_pct = models.FloatField(
        null=True,
        blank=True,
        help_text="Percentage of tickets where sla_breached=false"
    )
    sla_breached_count = models.PositiveIntegerField(default=0)

    # Legacy breakdowns (kept for backward compatibility during transition)
    by_category = models.JSONField(
        default=dict,
        help_text="{category_name: count}"
    )
    by_priority = models.JSONField(
        default=dict,
        help_text="{priority_name: count}"
    )
    by_status = models.JSONField(
        default=dict,
        help_text="{status_name: count}"
    )

    # Dynamic breakdowns for any detected field (new canonical source)
    field_breakdowns = models.JSONField(
        default=dict,
        help_text="{field_name: {value: count}} for every distinct field found in uploads"
    )

    # Computed timestamp
    computed_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('user', 'month')]
        ordering = ['-month']
        verbose_name = 'Monthly KPI'
        verbose_name_plural = 'Monthly KPIs'
        indexes = [
            models.Index(fields=['user', 'month']),
        ]

    def __str__(self):
        return f"{self.user.username} - {self.month.strftime('%Y-%m')}"


class KPIEvidence(models.Model):
    """
    Supporting evidence for ticket KPI / performance reviews.

    Users upload PDFs, images, email threads, or certificates that support
    their monthly work. Team leaders can review/approve evidence before it is
    included in end-of-year reports.
    """
    EVIDENCE_TYPES = [
        ('document', 'Document'),
        ('certificate', 'Certificate'),
        ('email_thread', 'Email Thread'),
        ('screenshot', 'Screenshot'),
        ('other', 'Other'),
    ]

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='ticket_kpi_evidence'
    )
    month = models.DateField(
        help_text="First day of the month this evidence applies to"
    )
    clients = models.ManyToManyField(
        Client,
        blank=True,
        related_name='ticket_kpi_evidence'
    )
    evidence_type = models.CharField(
        max_length=20,
        choices=EVIDENCE_TYPES,
        default='document'
    )
    file = models.FileField(
        upload_to='kpi_evidence/%Y/%m/',
        validators=[
            FileExtensionValidator(
                allowed_extensions=[
                    'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp',
                    'eml', 'msg', 'txt',
                    'doc', 'docx', 'xls', 'xlsx', 'csv',
                ]
            )
        ],
        help_text="Evidence file (PDF, image, email, text, Office doc)"
    )
    description = models.TextField(
        blank=True,
        help_text="Optional description/context for the evidence"
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )
    reviewed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_ticket_kpi_evidence'
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)

    # Cached structured preview for email threads (computed on first save)
    parsed_email = models.JSONField(
        default=dict,
        blank=True,
        help_text="Structured email preview (sender, date, subject, body, attachments)"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'KPI Evidence'
        verbose_name_plural = 'KPI Evidence'
        indexes = [
            models.Index(fields=['user', 'month']),
            models.Index(fields=['status']),
            models.Index(fields=['evidence_type']),
        ]

    def __str__(self):
        return f"{self.user.username} - {self.evidence_type} ({self.month.strftime('%Y-%m')})"
