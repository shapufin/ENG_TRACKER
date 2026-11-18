"""Passkeys (WebAuthn) as an alternative second factor, beside TOTP (``services/mfa.py``).

Challenge state lives in Postgres (``WebAuthnChallenge``), single use, never Redis.
Spec: docs/superpowers/specs/2026-11-18-passkeys-design.md.
"""
import base64
import json
import logging
import math
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers.exceptions import WebAuthnException
from webauthn.helpers.structs import (
    AttestationConveyancePreference,
    AuthenticatorSelectionCriteria,
    AuthenticatorTransport,
    PublicKeyCredentialDescriptor,
    UserVerificationRequirement,
)

from ..models.mfa import UserMFA, WebAuthnChallenge, WebAuthnCredential
from .mfa import LOCK_MINUTES, MAX_FAILURES, MFAError, audit

logger = logging.getLogger(__name__)

CHALLENGE_TTL_SECONDS = 120
NAME_MAX_LENGTH = 64
DEFAULT_NAME = 'Passkey'

_PASSKEY_INVALID = 'That passkey could not be verified. Try again, or use a code instead.'


def is_available() -> bool:
    """Passkeys are off until the RP ID and origins are configured (TOTP is unaffected)."""
    return bool(settings.WEBAUTHN_RP_ID and settings.WEBAUTHN_ORIGINS)


def _require_available() -> None:
    if not is_available():
        raise MFAError('unavailable', 'Passkeys are not available. Use a code instead.')


# --- Challenges --------------------------------------------------------------

def new_challenge(user, purpose: str) -> bytes:
    """A fresh single-use challenge. Expired and used rows are pruned here, so no job is needed."""
    now = timezone.now()
    WebAuthnChallenge.objects.filter(Q(expires_at__lt=now) | Q(used_at__isnull=False)).delete()
    challenge = secrets.token_bytes(32)
    WebAuthnChallenge.objects.create(
        user=user, purpose=purpose, challenge=challenge,
        expires_at=now + timedelta(seconds=CHALLENGE_TTL_SECONDS),
    )
    return challenge


def consume_challenge(user, purpose: str, challenge: bytes) -> None:
    """Mark ``challenge`` used, or raise. A challenge verifies at most once, even if the check fails."""
    with transaction.atomic():
        row = (
            WebAuthnChallenge.objects.select_for_update()
            .filter(user=user, purpose=purpose, challenge=challenge, used_at__isnull=True,
                    expires_at__gt=timezone.now())
            .first()
        )
        if row is None:
            raise MFAError('challenge_invalid', 'This sign-in step expired. Start again.')
        row.used_at = timezone.now()
        row.save(update_fields=['used_at', 'updated_at'])


def _b64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + '=' * (-len(value) % 4))


def _challenge_from_response(response) -> bytes:
    """The challenge the browser signed, read from its clientDataJSON."""
    try:
        client_data = json.loads(_b64url_decode(response['response']['clientDataJSON']))
        return _b64url_decode(client_data['challenge'])
    except (KeyError, TypeError, ValueError, AttributeError) as exc:
        raise MFAError('passkey_invalid', _PASSKEY_INVALID) from exc


# --- Registration ------------------------------------------------------------

def registration_options(user) -> dict:
    """Options for ``navigator.credentials.create`` (JSON-ready)."""
    _require_available()
    options = generate_registration_options(
        rp_id=settings.WEBAUTHN_RP_ID,
        rp_name=settings.WEBAUTHN_RP_NAME,
        user_name=user.username,
        user_display_name=user.get_full_name() or user.username,
        user_id=str(user.pk).encode(),
        challenge=new_challenge(user, WebAuthnChallenge.PURPOSE_REGISTER),
        attestation=AttestationConveyancePreference.NONE,
        authenticator_selection=AuthenticatorSelectionCriteria(
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        exclude_credentials=[
            PublicKeyCredentialDescriptor(id=bytes(credential.credential_id))
            for credential in WebAuthnCredential.objects.filter(user=user)
        ],
    )
    return json.loads(options_to_json(options))


def _clean_name(name: str) -> str:
    return (name or '').strip()[:NAME_MAX_LENGTH] or DEFAULT_NAME


def register(user, response: dict, name: str) -> WebAuthnCredential:
    """Verify a browser registration response and store the passkey."""
    _require_available()
    challenge = _challenge_from_response(response)
    consume_challenge(user, WebAuthnChallenge.PURPOSE_REGISTER, challenge)
    try:
        verified = verify_registration_response(
            credential=response,
            expected_challenge=challenge,
            expected_rp_id=settings.WEBAUTHN_RP_ID,
            expected_origin=list(settings.WEBAUTHN_ORIGINS),
            require_user_verification=True,
        )
    except (WebAuthnException, KeyError, TypeError, ValueError) as exc:
        logger.info('Passkey registration refused for user %s: %s', user.pk, exc)
        raise MFAError('passkey_invalid', _PASSKEY_INVALID) from exc

    transports = response.get('response', {}).get('transports') or []
    try:
        with transaction.atomic():
            return WebAuthnCredential.objects.create(
                user=user,
                credential_id=verified.credential_id,
                public_key=verified.credential_public_key,
                sign_count=verified.sign_count,
                transports=[str(t) for t in transports],
                name=_clean_name(name),
            )
    except IntegrityError as exc:
        raise MFAError('credential_exists', 'This passkey is already registered.') from exc


# --- Sign-in -----------------------------------------------------------------

def _descriptor(credential: WebAuthnCredential) -> PublicKeyCredentialDescriptor:
    transports = []
    for value in credential.transports or []:
        try:
            transports.append(AuthenticatorTransport(value))
        except ValueError:
            continue
    return PublicKeyCredentialDescriptor(id=bytes(credential.credential_id), transports=transports or None)


def authentication_options(user) -> dict:
    """Options for ``navigator.credentials.get`` limited to this user's passkeys."""
    _require_available()
    credentials = list(WebAuthnCredential.objects.filter(user=user))
    if not credentials:
        raise MFAError('not_enrolled', 'No passkey is set up for this account.')
    options = generate_authentication_options(
        rp_id=settings.WEBAUTHN_RP_ID,
        challenge=new_challenge(user, WebAuthnChallenge.PURPOSE_LOGIN),
        allow_credentials=[_descriptor(credential) for credential in credentials],
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    return json.loads(options_to_json(options))


def _lock_row(user) -> UserMFA:
    """The user's failure counter row (created seedless and disabled for a passkey-only user)."""
    row, _ = UserMFA.objects.select_for_update().get_or_create(
        user=user, defaults={'secret_ciphertext': '', 'is_enabled': False},
    )
    return row


def _locked_error(locked_until) -> MFAError:
    minutes = max(1, math.ceil((locked_until - timezone.now()).total_seconds() / 60))
    unit = 'minute' if minutes == 1 else 'minutes'
    return MFAError('locked', f'Too many wrong attempts. Try again in {minutes} {unit}.', reason='locked')


def _record_failure(user, message: str, reason: str) -> MFAError:
    """Count a failed attempt (shared with TOTP) and return the error to raise."""
    with transaction.atomic():
        row = _lock_row(user)
        row.failed_attempts += 1
        if row.failed_attempts >= MAX_FAILURES:
            row.failed_attempts = 0
            row.locked_until = timezone.now() + timedelta(minutes=LOCK_MINUTES)
        row.save(update_fields=['failed_attempts', 'locked_until', 'updated_at'])
        locked_until = row.locked_until if row.locked_until and row.locked_until > timezone.now() else None
    if locked_until:
        return _locked_error(locked_until)
    return MFAError('passkey_invalid', message, reason=reason)


def verify_assertion(user, response: dict) -> WebAuthnCredential:
    """Verify a browser sign-in response for ``user``; raises ``MFAError`` on any failure."""
    _require_available()
    with transaction.atomic():
        locked_until = _lock_row(user).locked_until
    if locked_until and locked_until > timezone.now():
        raise _locked_error(locked_until)

    challenge = _challenge_from_response(response)
    consume_challenge(user, WebAuthnChallenge.PURPOSE_LOGIN, challenge)
    try:
        raw_id = _b64url_decode(response['rawId'])
    except (KeyError, TypeError, ValueError) as exc:
        raise _record_failure(user, _PASSKEY_INVALID, 'malformed') from exc
    credential = WebAuthnCredential.objects.filter(user=user, credential_id=raw_id).first()
    if credential is None:
        raise _record_failure(user, _PASSKEY_INVALID, 'unknown_credential')

    try:
        verified = verify_authentication_response(
            credential=response,
            expected_challenge=challenge,
            expected_rp_id=settings.WEBAUTHN_RP_ID,
            expected_origin=list(settings.WEBAUTHN_ORIGINS),
            credential_public_key=bytes(credential.public_key),
            credential_current_sign_count=credential.sign_count,
            require_user_verification=True,
        )
    except (WebAuthnException, KeyError, TypeError, ValueError) as exc:
        logger.info('Passkey sign-in refused for user %s: %s', user.pk, exc)
        # py_webauthn reports a non-increasing counter as "sign count ... not greater";
        # test_counter_regression_is_rejected_and_audited pins that wording.
        if 'sign count' in str(exc):
            audit(user, 'mfa_passkey_clone_suspected',
                  f"Passkey '{credential.name}' of {user.username} reported a lower sign counter", user)
        raise _record_failure(user, _PASSKEY_INVALID, 'verification_failed') from exc

    with transaction.atomic():
        row = _lock_row(user)
        row.failed_attempts = 0
        row.locked_until = None
        row.save(update_fields=['failed_attempts', 'locked_until', 'updated_at'])
        WebAuthnCredential.objects.filter(pk=credential.pk).update(
            sign_count=verified.new_sign_count, last_used_at=timezone.now(),
        )
    credential.refresh_from_db()
    return credential
