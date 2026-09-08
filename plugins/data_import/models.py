from django.db import models
from django.contrib.auth.models import User


class ImportProfile(models.Model):
    """
    Saved, reusable mapping configuration for a given import target.
    """
    name = models.CharField(max_length=100)
    target_key = models.CharField(max_length=50)
    field_mapping = models.JSONField(
        default=dict,
        help_text="Map our normalized fields to the uploaded file's column names"
    )
    default_values = models.JSONField(
        default=dict,
        help_text="Fixed default values for unmapped fields"
    )
    options = models.JSONField(
        default=dict,
        help_text="Importer options (update_existing, password_strategy, etc.)"
    )
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='data_import_profiles'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'data_import_profiles'
        unique_together = ['name', 'target_key']
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.target_key})"


class ImportBatch(models.Model):
    """
    Audit record of one import commit run. Rows are written directly to the real
    target tables; this model is purely for history and debugging.
    """
    target_key = models.CharField(max_length=50)
    profile = models.ForeignKey(
        ImportProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='batches'
    )
    uploaded_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='data_import_batches'
    )
    original_filename = models.CharField(max_length=255)
    field_mapping_used = models.JSONField(default=dict)
    options_used = models.JSONField(default=dict)
    total_rows = models.PositiveIntegerField(default=0)
    created_count = models.PositiveIntegerField(default=0)
    updated_count = models.PositiveIntegerField(default=0)
    skipped_count = models.PositiveIntegerField(default=0)
    error_count = models.PositiveIntegerField(default=0)
    row_errors = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'data_import_batches'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['target_key']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"{self.target_key} import ({self.created_count} created, {self.updated_count} updated, {self.error_count} errors)"