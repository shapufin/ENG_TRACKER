"""
Abstract base models for reuse across all apps.

This module provides common model functionality that should be inherited
by all models in the application for consistency and DRY principles.
"""

import uuid
from django.db import models
from django.utils import timezone


class TimeStampedModel(models.Model):
    """
    Abstract base model that provides self-updating
    `created_at` and `updated_at` timestamps.
    """
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        abstract = True
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.__class__.__name__} ({self.id})"


class SoftDeleteModel(models.Model):
    """
    Abstract base model that provides soft delete functionality.
    
    Instead of permanently deleting records, this sets an `is_deleted` flag
    and records when/by whom the deletion occurred.
    """
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(
        'auth.User', 
        null=True, 
        blank=True, 
        on_delete=models.SET_NULL,
        related_name='deleted_%(class)s'
    )
    
    class Meta:
        abstract = True
    
    def soft_delete(self, user=None):
        """Soft delete the instance by setting is_deleted=True."""
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.deleted_by = user
        self.save()
    
    def restore(self):
        """Restore a soft-deleted instance."""
        self.is_deleted = False
        self.deleted_at = None
        self.deleted_by = None
        self.save()
    
    def hard_delete(self):
        """Permanently delete the instance from the database."""
        super().delete()


class UUIDModel(models.Model):
    """
    Abstract base model that uses UUID as the primary key.
    
    Useful for distributed systems where auto-incrementing IDs
    could cause conflicts.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    class Meta:
        abstract = True


class BaseModel(TimeStampedModel, SoftDeleteModel):
    """
    Comprehensive abstract base model combining:
    - Time stamping (created_at, updated_at)
    - Soft deletion (is_deleted, deleted_at, deleted_by)
    
    This is the recommended base model for most models in the application.
    """
    
    class Meta:
        abstract = True
        ordering = ['-created_at']


class BaseUUIDModel(UUIDModel, TimeStampedModel, SoftDeleteModel):
    """
    Ultimate abstract base model combining:
    - UUID primary key
    - Time stamping
    - Soft deletion
    
    Use this when you need UUID as primary key along with audit fields.
    """
    
    class Meta:
        abstract = True
        ordering = ['-created_at']


class TrackedFieldsMixin(models.Model):
    """Remember selected field values as loaded/last saved, at zero query cost.

    ``tracked_fields`` names the fields; ``_old_fields`` holds their values as of
    ``from_db`` (or the previous ``save()``), or ``None`` for a never-saved
    instance. Signal handlers compare it with the instance's current values to
    detect a *meaningful* change without the extra ``SELECT`` a pre_save lookup
    costs on every save. Deferred (``.only()``) fields are simply not tracked.
    """

    tracked_fields: tuple = ()

    class Meta:
        abstract = True

    @classmethod
    def from_db(cls, db, field_names, values):
        instance = super().from_db(db, field_names, values)
        instance._snapshot_tracked_fields()
        return instance

    def _snapshot_tracked_fields(self):
        self._old_fields = {
            name: self.__dict__[name] for name in self.tracked_fields if name in self.__dict__
        }

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self._snapshot_tracked_fields()
