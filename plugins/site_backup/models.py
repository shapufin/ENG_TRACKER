from django.contrib.auth.models import User
from django.db import models


class BackupRecord(models.Model):
    """One full-site backup archive (DB fixture + media zip).

    Stored under ``MEDIA_ROOT/backups/`` and excluded from every backup's own
    media zip so restoring a backup never wipes the site's backup history.
    """
    file = models.FileField(upload_to='backups/')
    filename = models.CharField(max_length=255)
    size_bytes = models.BigIntegerField(default=0)
    checksum = models.CharField(max_length=64, help_text='SHA-256 hex digest of the archive file.')
    migration_state_hash = models.CharField(
        max_length=64,
        help_text='SHA-256 of the applied-migrations set at backup time, used to block restore onto an incompatible schema.',
    )
    db_row_count = models.PositiveIntegerField(default=0, help_text='Total DB rows captured across all dumped models.')
    media_file_count = models.PositiveIntegerField(default=0)
    note = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='site_backups',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'site_backup_records'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.filename} ({self.created_at:%Y-%m-%d %H:%M})'
