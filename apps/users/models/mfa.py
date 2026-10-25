"""Multi-factor authentication models.

Deliberately plain ``TimeStampedModel`` rows, not ``BaseModel``: a soft-deleted
credential must never keep authenticating (same reasoning as ``UserTech``).
Whether MFA is *required* for someone lives on ``UserProfile.mfa_required`` and
``GlobalSettings.mfa_required``, so it can be set before a person enrols.
"""

from django.contrib.auth import get_user_model
from django.db import models

from core.models.abstract import TimeStampedModel

User = get_user_model()


class UserMFA(TimeStampedModel):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='mfa')
    secret_ciphertext = models.TextField(
        help_text='Base32 TOTP seed, Fernet-encrypted with MFA_ENCRYPTION_KEYS.'
    )
    is_enabled = models.BooleanField(
        default=False,
        help_text='False while a seed is pending its first verified code.',
    )
    enabled_at = models.DateTimeField(null=True, blank=True)
    last_used_step = models.BigIntegerField(
        null=True, blank=True,
        help_text='Newest accepted 30-second step; a code at or below it is a replay.',
    )
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'users_user_mfa'

    def __str__(self):
        return f'MFA({self.user_id}, enabled={self.is_enabled})'


class MFABackupCode(TimeStampedModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='mfa_backup_codes')
    salt = models.CharField(max_length=32)
    digest = models.CharField(max_length=64)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'users_mfa_backup_code'
        indexes = [models.Index(fields=['user', 'used_at'])]

    def __str__(self):
        return f'MFABackupCode({self.user_id}, used={self.used_at is not None})'
