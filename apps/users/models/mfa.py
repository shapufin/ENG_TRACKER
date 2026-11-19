"""Multi-factor authentication models.

Deliberately plain ``TimeStampedModel`` rows, not ``BaseModel``: a soft-deleted
credential must never keep authenticating (same reasoning as ``UserTech``).
Whether MFA is *required* for someone lives on ``UserProfile.mfa_required`` and
``GlobalSettings.mfa_required``, so it can be set before a person enrols.
"""

import uuid

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


class WebAuthnCredential(TimeStampedModel):
    """A passkey. Another second factor, never a replacement for TOTP (item 27)."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='passkeys')
    credential_id = models.BinaryField(unique=True, max_length=1023)
    public_key = models.BinaryField()
    sign_count = models.PositiveBigIntegerField(default=0)
    transports = models.JSONField(default=list, blank=True)
    name = models.CharField(max_length=64)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'users_webauthn_credential'
        ordering = ['created_at', 'id']

    def __str__(self):
        return f'Passkey({self.user_id}, {self.name})'


class WebAuthnChallenge(TimeStampedModel):
    """Single-use challenge, in Postgres (never Redis) so replay protection survives eviction."""
    PURPOSE_REGISTER = 'register'
    PURPOSE_LOGIN = 'login'

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='passkey_challenges')
    purpose = models.CharField(max_length=16)
    challenge = models.BinaryField()
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'users_webauthn_challenge'
        indexes = [models.Index(fields=['user', 'purpose', 'used_at'])]


class PairedPhone(TimeStampedModel):
    """A phone allowed to approve this user's sign-ins (item 90).

    The phone's identity is its passkey, so removing the passkey unpairs the phone.
    A blank ``push_endpoint`` means QR-only. Plain row, no soft delete, never in Site Backup.
    """
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='paired_phones')
    credential = models.OneToOneField(
        WebAuthnCredential, on_delete=models.CASCADE, related_name='paired_phone',
    )
    name = models.CharField(max_length=64)
    push_endpoint = models.URLField(max_length=500, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'users_paired_phone'
        ordering = ['created_at', 'id']

    def __str__(self):
        return f'PairedPhone({self.user_id}, {self.name})'


class PhoneLoginRequest(TimeStampedModel):
    """One sign-in waiting for a paired phone. Live state in Postgres (never Redis); pruned lazily."""
    STATUS_PENDING = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_DENIED = 'denied'

    public_id = models.UUIDField(unique=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='phone_login_requests')
    status = models.CharField(max_length=10, default=STATUS_PENDING)
    number = models.PositiveSmallIntegerField(help_text='The 2-digit number the PC shows.')
    options = models.JSONField(default=list, help_text='The three numbers the phone shows, shuffled.')
    challenge = models.BinaryField()
    collector_digest = models.CharField(
        max_length=64, help_text='sha256 hex of the key only the requesting PC holds.',
    )
    expires_at = models.DateTimeField()
    decided_at = models.DateTimeField(null=True, blank=True)
    consumed_at = models.DateTimeField(null=True, blank=True)
    credential = models.ForeignKey(
        WebAuthnCredential, null=True, blank=True, on_delete=models.SET_NULL, related_name='+',
    )
    requester_ip = models.GenericIPAddressField(null=True, blank=True)
    requester_agent = models.CharField(max_length=200, blank=True)

    class Meta:
        db_table = 'users_phone_login_request'
        indexes = [models.Index(fields=['user', 'status', 'expires_at'])]

    def __str__(self):
        return f'PhoneLoginRequest({self.user_id}, {self.status})'
