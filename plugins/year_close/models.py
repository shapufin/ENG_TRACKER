"""Frozen evidence sets for a closed year (plan Y3).

A snapshot is built once per year and never edited afterwards: the year's
overtime, standby, leave and payroll evidence is written to ZIP files under
``SNAPSHOT_ROOT``, each with a sha256, and the set is described by
``{year}/MANIFEST.json``. Names are stored as text copies so a snapshot stays
readable after the user or team it belongs to is deleted.
"""
from django.db import models

from core.models.abstract import BaseModel


class YearSnapshot(BaseModel):
    """One build attempt for one year. A year may have several versions."""

    STATUS_CHOICES = [
        ('blocked', 'Blocked'),
        ('building', 'Building'),
        ('ready', 'Ready'),
        ('failed', 'Failed'),
        ('superseded', 'Superseded'),
    ]

    year = models.PositiveIntegerField(db_index=True)
    version = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='blocked')
    # {"blockers": [...], "warnings": [...]} captured at build time — the durable
    # record of why a year was blocked, because audit rows can be purged.
    readiness = models.JSONField(default=dict, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    total_bytes = models.BigIntegerField(default=0)

    class Meta:
        db_table = 'year_close_snapshots'
        ordering = ['-year', '-version']
        constraints = [
            models.UniqueConstraint(fields=['year', 'version'], name='year_close_snapshot_unique'),
        ]
        indexes = [
            models.Index(fields=['year', 'status']),
        ]

    def __str__(self):
        return f'Year {self.year} v{self.version} ({self.status})'


class YearSnapshotFile(BaseModel):
    """One ZIP in a snapshot set. ``kind`` says what the file covers."""

    KIND_CHOICES = [
        ('team', 'IT TL / Team'),
        ('unassigned', 'Unassigned users'),
        ('company', 'Company'),
        ('manifest', 'Manifest'),
    ]
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('ready', 'Ready'),
        ('failed', 'Failed'),
    ]

    snapshot = models.ForeignKey(
        YearSnapshot, on_delete=models.CASCADE, related_name='files',
    )
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    # Text copies, not FKs: the pair may be deleted long before the year is read.
    leader_name = models.CharField(max_length=200, blank=True)
    team_name = models.CharField(max_length=200, blank=True)
    relative_path = models.CharField(max_length=500)
    sha256 = models.CharField(max_length=64, blank=True)
    size = models.BigIntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    error = models.TextField(blank=True)
    # Single-use download token (the previous-years page mints it, Y4).
    download_nonce = models.CharField(max_length=64, blank=True)

    class Meta:
        db_table = 'year_close_snapshot_files'
        ordering = ['kind', 'leader_name', 'team_name']
        constraints = [
            models.UniqueConstraint(
                fields=['snapshot', 'relative_path'], name='year_close_file_path_unique',
            ),
        ]

    def __str__(self):
        return f'{self.relative_path} ({self.status})'
