"""TOTP (RFC 6238) second factor: enrolment, verification, backup codes, policy.

All state that decides whether a code is accepted (replay step, failure count,
lockout, spent backup codes) lives in Postgres under a row lock, never in
Redis: the cache runs ``allkeys-lru`` and may evict a key at any time.
"""

import base64
import hashlib
import hmac
import io
import logging
import secrets
import struct
import time
from datetime import timedelta
from urllib.parse import quote

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import signing
from django.db import transaction
from django.utils import timezone

from core.utils.crypto import SecretDecryptError, decrypt_text, encrypt_text
from ..models.mfa import MFABackupCode, UserMFA

logger = logging.getLogger(__name__)

STEP_SECONDS = 30
CODE_DIGITS = 6
STEP_WINDOW = 1  # accept the previous, current and next step (+-30 s of clock drift)
MAX_FAILURES = 5
LOCK_MINUTES = 15
CHALLENGE_MAX_AGE = 300
BACKUP_CODE_COUNT = 10
BACKUP_CODE_LENGTH = 12
# No I, L, O, 0 or 1: a code read off paper is never ambiguous. 12 chars is about 59 bits.
BACKUP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
_CHALLENGE_SALT = 'users.mfa.challenge'

PURPOSE_VERIFY = 'verify'
PURPOSE_SETUP = 'setup'


class MFAError(Exception):
    """``code`` is a stable machine string the views map to an HTTP status."""

    def __init__(self, code, message=''):
        super().__init__(message or code)
        self.code = code
        self.message = message or code


# --- TOTP primitives ---------------------------------------------------------

def generate_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip('=')


def _hotp(secret: str, counter: int) -> str:
    key = base64.b32decode(secret + '=' * (-len(secret) % 8), casefold=True)
    mac = hmac.new(key, struct.pack('>Q', counter), hashlib.sha1).digest()
    offset = mac[-1] & 0x0F
    value = (struct.unpack('>I', mac[offset:offset + 4])[0] & 0x7FFFFFFF) % (10 ** CODE_DIGITS)
    return f'{value:0{CODE_DIGITS}d}'


def current_step(now: float | None = None) -> int:
    return int((time.time() if now is None else now) // STEP_SECONDS)


def code_at(secret: str, step: int) -> str:
    """The code for ``step``. Test helper and the single place a code is derived."""
    return _hotp(secret, step)


def match_step(secret: str, code: str, now: float | None = None) -> int | None:
    """The step whose code equals ``code`` inside the drift window, else None."""
    base = current_step(now)
    matched = None
    for step in range(base - STEP_WINDOW, base + STEP_WINDOW + 1):
        if hmac.compare_digest(_hotp(secret, step), code):
            matched = step
    return matched


def provisioning_uri(secret: str, account: str) -> str:
    issuer = settings.MFA_ISSUER
    label = quote(f'{issuer}:{account}', safe='')
    return (
        f'otpauth://totp/{label}?secret={secret}&issuer={quote(issuer, safe="")}'
        f'&algorithm=SHA1&digits={CODE_DIGITS}&period={STEP_SECONDS}'
    )


def qr_svg(uri: str) -> str:
    import qrcode
    import qrcode.image.svg

    image = qrcode.make(uri, image_factory=qrcode.image.svg.SvgPathImage, box_size=10, border=2)
    buffer = io.BytesIO()
    image.save(buffer)
    return buffer.getvalue().decode()


# --- Policy ------------------------------------------------------------------

def _global_required() -> bool:
    from apps.leave_management.models import GlobalSettings

    return bool(GlobalSettings.objects.filter(pk=1).values_list('mfa_required', flat=True).first())


def required_source(user) -> str | None:
    """Why MFA is mandatory for ``user``: 'user', 'global', or None (optional)."""
    profile = getattr(user, 'profile', None)
    if profile is not None and profile.mfa_required:
        return 'user'
    if _global_required():
        return 'global'
    return None


def is_enrolled(user) -> bool:
    return UserMFA.objects.filter(user=user, is_enabled=True).exists()


def status_for(user) -> dict:
    enrolled = is_enrolled(user)
    return {
        'enabled': enrolled,
        'required': required_source(user) is not None,
        'required_by': required_source(user),
        'backup_codes_remaining': (
            MFABackupCode.objects.filter(user=user, used_at__isnull=True).count() if enrolled else 0
        ),
    }


# --- Login challenge ---------------------------------------------------------

def _fingerprint(user) -> str:
    """Ties a challenge to the current password, so changing it voids pending challenges."""
    return hashlib.sha256(user.password.encode()).hexdigest()[:16]


def make_challenge(user, purpose: str) -> str:
    return signing.dumps(
        {'u': user.pk, 'p': purpose, 'f': _fingerprint(user)}, salt=_CHALLENGE_SALT
    )


def read_challenge(token: str, purpose: str):
    """The user a still-valid challenge of ``purpose`` belongs to."""
    try:
        payload = signing.loads(token, salt=_CHALLENGE_SALT, max_age=CHALLENGE_MAX_AGE)
    except signing.BadSignature as exc:  # includes SignatureExpired
        raise MFAError('challenge_invalid', 'This sign-in step expired. Start again.') from exc
    user = get_user_model().objects.filter(pk=payload.get('u'), is_active=True).first()
    if user is None or payload.get('p') != purpose or payload.get('f') != _fingerprint(user):
        raise MFAError('challenge_invalid', 'This sign-in step expired. Start again.')
    return user


def login_challenge(user) -> dict | None:
    """What a password-authenticated ``user`` must still do, or None to sign in now."""
    if is_enrolled(user):
        return {'mfa_required': True, 'mfa_token': make_challenge(user, PURPOSE_VERIFY)}
    if required_source(user) is not None:
        return {'mfa_setup_required': True, 'mfa_token': make_challenge(user, PURPOSE_SETUP)}
    return None


# --- Backup codes ------------------------------------------------------------

def _normalise_backup(code: str) -> str:
    return ''.join(ch for ch in code.upper() if ch.isalnum())


def _digest(salt: str, code: str) -> str:
    return hashlib.sha256(f'{salt}:{code}'.encode()).hexdigest()


def generate_backup_codes(user) -> list[str]:
    """Replace the user's codes with fresh ones. Plaintext is returned once, never stored."""
    MFABackupCode.objects.filter(user=user).delete()
    plain, rows = [], []
    for _ in range(BACKUP_CODE_COUNT):
        code = ''.join(secrets.choice(BACKUP_ALPHABET) for _ in range(BACKUP_CODE_LENGTH))
        salt = secrets.token_hex(8)
        rows.append(MFABackupCode(user=user, salt=salt, digest=_digest(salt, code)))
        plain.append('-'.join(code[i:i + 4] for i in range(0, BACKUP_CODE_LENGTH, 4)))
    MFABackupCode.objects.bulk_create(rows)
    return plain


def _consume_backup_code(user, code: str) -> bool:
    normalised = _normalise_backup(code)
    if len(normalised) != BACKUP_CODE_LENGTH:
        return False
    for row in MFABackupCode.objects.filter(user=user, used_at__isnull=True):
        if hmac.compare_digest(row.digest, _digest(row.salt, normalised)):
            # Conditional update: only one of two racing requests sees rowcount 1.
            return MFABackupCode.objects.filter(pk=row.pk, used_at__isnull=True).update(
                used_at=timezone.now()
            ) == 1
    return False


# --- Enrolment ---------------------------------------------------------------

def begin_setup(user) -> dict:
    """Create (or replace) a pending seed. It does nothing until ``activate`` verifies a code."""
    if is_enrolled(user):
        raise MFAError('already_enabled', 'Two-factor authentication is already on.')
    secret = generate_secret()
    UserMFA.objects.update_or_create(
        user=user,
        defaults={
            'secret_ciphertext': encrypt_text(secret), 'is_enabled': False,
            'enabled_at': None, 'last_used_step': None, 'failed_attempts': 0, 'locked_until': None,
        },
    )
    uri = provisioning_uri(secret, user.email or user.username)
    return {'secret': secret, 'otpauth_uri': uri, 'qr_svg': qr_svg(uri)}


def activate(user, code: str) -> list[str]:
    """Verify the first code of a pending seed, switch MFA on, return the backup codes."""
    with transaction.atomic():
        mfa = UserMFA.objects.select_for_update().filter(user=user, is_enabled=False).first()
        if mfa is None:
            raise MFAError('no_pending_setup', 'Start setup again.')
        try:
            secret = decrypt_text(mfa.secret_ciphertext)
        except SecretDecryptError as exc:
            raise MFAError('unavailable', 'Two-factor authentication is unavailable.') from exc
        step = match_step(secret, ''.join(code.split()))
        if step is None:
            raise MFAError('invalid_code', 'That code is not right. Check your authenticator app and try again.')
        mfa.is_enabled = True
        mfa.enabled_at = timezone.now()
        mfa.last_used_step = step
        mfa.save(update_fields=['is_enabled', 'enabled_at', 'last_used_step', 'updated_at'])
        return generate_backup_codes(user)


# --- Verification ------------------------------------------------------------

def verify_second_factor(user, code: str) -> None:
    """Accept a TOTP or backup code once, or raise ``MFAError``.

    Failures are committed (the counter must survive), so the decision is made
    inside the transaction and the exception raised after it closes.
    """
    outcome = None
    with transaction.atomic():
        mfa = UserMFA.objects.select_for_update().filter(user=user, is_enabled=True).first()
        if mfa is None:
            raise MFAError('not_enrolled', 'Two-factor authentication is not set up.')
        now = timezone.now()
        if mfa.locked_until and mfa.locked_until > now:
            outcome = 'locked'
        else:
            try:
                secret = decrypt_text(mfa.secret_ciphertext)
            except SecretDecryptError:
                logger.error('MFA seed for user %s cannot be decrypted; check MFA_ENCRYPTION_KEYS.', user.pk)
                raise MFAError('unavailable', 'Two-factor authentication is unavailable. Contact an administrator.')
            candidate = ''.join(code.split())
            accepted = False
            if candidate.isdigit() and len(candidate) == CODE_DIGITS:
                step = match_step(secret, candidate)
                if step is not None and (mfa.last_used_step is None or step > mfa.last_used_step):
                    mfa.last_used_step = step
                    accepted = True
            else:
                accepted = _consume_backup_code(user, candidate)

            if accepted:
                mfa.failed_attempts = 0
                mfa.locked_until = None
                outcome = 'ok'
            else:
                mfa.failed_attempts += 1
                outcome = 'invalid_code'
                if mfa.failed_attempts >= MAX_FAILURES:
                    mfa.failed_attempts = 0
                    mfa.locked_until = now + timedelta(minutes=LOCK_MINUTES)
                    outcome = 'locked'
            mfa.save(update_fields=['last_used_step', 'failed_attempts', 'locked_until', 'updated_at'])

    if outcome == 'locked':
        raise MFAError('locked', f'Too many wrong codes. Try again in {LOCK_MINUTES} minutes.')
    if outcome == 'invalid_code':
        raise MFAError('invalid_code', 'That code is not right. Check your authenticator app and try again.')


def check_step_up(user, password: str, code: str) -> None:
    """Re-prove password and (when enrolled) a current code before a sensitive change."""
    if not user.check_password(password or ''):
        raise MFAError('invalid_password', 'The password is not correct.')
    if is_enrolled(user):
        verify_second_factor(user, code or '')


# --- Audit -------------------------------------------------------------------

def audit(actor, action: str, description: str, target=None) -> None:
    """Record a security event if the optional audit_log plugin is installed.

    ``except ImportError`` only: a missing plugin means "no trail", a bug in the
    plugin must surface (``log_action`` already guards its own writes).
    """
    try:
        from plugins.audit_log.signals import log_action
    except ImportError:
        return
    log_action(actor, action, description=description, obj=target)


# --- Reset / disable ---------------------------------------------------------

def remove_mfa(user) -> None:
    with transaction.atomic():
        MFABackupCode.objects.filter(user=user).delete()
        UserMFA.objects.filter(user=user).delete()
