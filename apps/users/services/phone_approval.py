"""Phone approval sign-in: a paired phone approves a password-authenticated login (item 90).

The PC creates a ``PhoneLoginRequest`` after the password step and polls with a secret
``collect_key``. The phone proves the request with a WebAuthn assertion from a paired
passkey bound to the request's challenge, plus a number-match tap. Decision state lives
in Postgres (never Redis); every check fails closed. Pairing lives in ``phone_pairing``.
Spec: docs/superpowers/specs/2026-11-19-phone-approval-login-design.md.
"""
import hashlib
import hmac
import json
import logging
import random
import secrets
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from webauthn import generate_authentication_options, options_to_json
from webauthn.helpers.structs import UserVerificationRequirement

from ..models.mfa import PairedPhone, PhoneLoginRequest
from . import mfa, webauthn
from .mfa import MFAError

logger = logging.getLogger(__name__)

PHONE_REQUEST_TTL_SECONDS = 120
MAX_LIVE_REQUESTS = 3
PRUNE_AFTER = timedelta(hours=1)
VIA_CHOICES = ('push', 'qr')
_RNG = random.SystemRandom()

_INVALID = MFAError('request_invalid', 'This sign-in request was not found. Start again on your computer.')


def phone_approval_enabled() -> bool:
    return bool(getattr(settings, 'PHONE_APPROVAL_ENABLED', False)) and webauthn.is_available()


def _require_enabled() -> None:
    if not phone_approval_enabled():
        raise MFAError('unavailable', 'Phone approval is not available. Use a code instead.')


def _invalid() -> MFAError:
    return MFAError(_INVALID.code, _INVALID.message)


def _digest(collect_key: str) -> str:
    return hashlib.sha256(collect_key.encode()).hexdigest()


def _lookup(public_id, *, user=None, lock: bool = False) -> PhoneLoginRequest:
    """The request, or ``request_invalid`` for an unknown, malformed or foreign id."""
    try:
        uuid_value = uuid.UUID(str(public_id))
    except ValueError as exc:
        raise _invalid() from exc
    queryset = PhoneLoginRequest.objects.select_for_update() if lock else PhoneLoginRequest.objects
    filters = {'public_id': uuid_value}
    if user is not None:
        filters['user'] = user
    row = queryset.filter(**filters).first()
    if row is None:
        raise _invalid()
    return row


def _live_error(row: PhoneLoginRequest) -> MFAError | None:
    """Why a decided, consumed or timed-out request cannot be acted on, else None."""
    if row.status != PhoneLoginRequest.STATUS_PENDING or row.consumed_at is not None:
        return MFAError('request_used', 'This sign-in request was already answered.')
    if row.expires_at <= timezone.now():
        return MFAError('request_expired', 'This request expired. Start again on your computer.')
    return None


def _approve_url(public_id) -> str:
    return f'{settings.WEBAUTHN_ORIGINS[0]}/phone-approve/{public_id}'


def _push_to_phones(user, approve_url: str) -> bool:
    """Push the approval link to the user's paired phones. Never raises; False means "use the QR".

    ``apps.users`` must not import a plugin statically (plugin removal safety), so the
    notifications service is imported lazily and its absence just means no push.
    """
    endpoints = list(
        PairedPhone.objects.filter(user=user).exclude(push_endpoint='').values_list('push_endpoint', flat=True)
    )
    if not endpoints:
        return False
    try:
        from plugins.notifications.push_service import send_push_notification
    except ImportError:
        return False
    try:
        sent, _failed = send_push_notification(
            user, 'Approve this sign-in?',
            'Open to approve with your fingerprint or face. Only if you are signing in now.',
            url=approve_url, endpoints=endpoints,
        )
    except Exception as exc:  # a push problem must never fail the sign-in step
        logger.warning('Phone approval push failed for user %s: %s', user.pk, exc)
        return False
    return sent > 0


def request_approval(user, via: str, ip: str | None, agent: str) -> dict:
    """Create a pending request for ``user`` (already past the password step)."""
    _require_enabled()
    if via not in VIA_CHOICES:
        raise _invalid()
    if not PairedPhone.objects.filter(user=user).exists():
        raise MFAError('no_phone', 'No phone is set up to approve sign-ins.')
    webauthn.assert_not_locked(user)

    now = timezone.now()
    PhoneLoginRequest.objects.filter(expires_at__lt=now - PRUNE_AFTER).delete()
    live = PhoneLoginRequest.objects.filter(
        user=user, status=PhoneLoginRequest.STATUS_PENDING, expires_at__gt=now,
    ).count()
    if live >= MAX_LIVE_REQUESTS:
        raise MFAError('too_many_requests', 'Too many sign-in requests are waiting. Wait a minute and try again.')

    number, *decoys = _RNG.sample(range(10, 100), 3)
    options = [number, *decoys]
    _RNG.shuffle(options)
    collect_key = secrets.token_urlsafe(32)
    row = PhoneLoginRequest.objects.create(
        user=user, number=number, options=options, challenge=secrets.token_bytes(32),
        collector_digest=_digest(collect_key),
        expires_at=now + timedelta(seconds=PHONE_REQUEST_TTL_SECONDS),
        requester_ip=ip or None, requester_agent=(agent or '')[:200],
    )
    approve_url = _approve_url(row.public_id)
    pushed = _push_to_phones(user, approve_url) if via == 'push' else False
    return {
        'request_id': str(row.public_id), 'number': number, 'collect_key': collect_key,
        'expires_in': PHONE_REQUEST_TTL_SECONDS, 'pushed': pushed,
        'qr_svg': mfa.qr_svg(approve_url), 'approve_url': approve_url,
    }


def request_owner(public_id):
    """The user a request belongs to (for the view's maintenance check); ``request_invalid`` if unknown."""
    _require_enabled()
    return _lookup(public_id).user


def approval_view(public_id) -> dict:
    """What the phone shows: the three numbers, who is signing in from where, and the assertion options."""
    _require_enabled()
    row = _lookup(public_id)
    error = _live_error(row)
    if error:
        raise error
    credentials = [
        phone.credential for phone in PairedPhone.objects.filter(user=row.user).select_related('credential')
    ]
    if not credentials:
        raise MFAError('no_phone', 'No phone is set up to approve sign-ins.')
    options = generate_authentication_options(
        rp_id=settings.WEBAUTHN_RP_ID, challenge=bytes(row.challenge),
        allow_credentials=[webauthn._descriptor(credential) for credential in credentials],
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    return {
        'options': list(row.options),
        'requester': {'agent': row.requester_agent, 'ip': row.requester_ip, 'at': row.created_at.isoformat()},
        'username': row.user.username,
        'assertion': json.loads(options_to_json(options)),
        'expires_in': max(0, int((row.expires_at - timezone.now()).total_seconds())),
    }


def _fail_request(row: PhoneLoginRequest) -> None:
    PhoneLoginRequest.objects.filter(pk=row.pk, status=PhoneLoginRequest.STATUS_PENDING).update(
        status=PhoneLoginRequest.STATUS_DENIED, decided_at=timezone.now(),
    )


def decide(public_id, decision: str, number: int | None = None, response: dict | None = None) -> None:
    """Approve (number plus a paired-passkey assertion) or deny a pending request."""
    _require_enabled()
    if decision not in ('approve', 'deny'):
        raise _invalid()
    with transaction.atomic():
        row = _lookup(public_id, lock=True)
        error = _live_error(row)
        if error:
            raise error
        user = row.user
        if decision == 'deny':
            _fail_request(row)
    if decision == 'deny':
        mfa.audit(user, 'mfa_phone_denied', f'{user.username} denied a phone sign-in request', user)
        return

    webauthn.assert_not_locked(user)
    if not isinstance(number, int) or isinstance(number, bool) or number != row.number:
        _fail_request(row)
        failure = webauthn._record_failure(user, 'Wrong number.', 'wrong_number')
        mfa.audit(user, 'mfa_phone_wrong_number', f'{user.username} picked the wrong number on a phone sign-in', user)
        if failure.code == 'locked':
            raise failure
        raise MFAError('wrong_number', 'That is not the number on your computer. The request was cancelled.')

    # The assertion check counts its own failures, so it must run outside the row lock's
    # transaction: an exception here must not roll the failure counter back.
    credential = webauthn.verify_assertion_for_challenge(
        user, response, bytes(row.challenge), require_paired=True,
    )
    with transaction.atomic():
        row = _lookup(public_id, lock=True)
        error = _live_error(row)
        if error:
            raise error
        row.status = PhoneLoginRequest.STATUS_APPROVED
        row.decided_at = timezone.now()
        row.credential = credential
        row.save(update_fields=['status', 'decided_at', 'credential', 'updated_at'])
        PairedPhone.objects.filter(credential=credential).update(last_used_at=timezone.now())
    mfa.audit(user, 'mfa_phone_approved', f'{user.username} approved a sign-in with a paired phone', user)


def collect(user, public_id, collect_key: str, *, consume: bool = True) -> str:
    """The PC's poll: ``pending | denied | expired | approved``.

    Needs the request to be ``user``'s and the key only the PC holds; anything else is
    ``request_invalid``. With ``consume`` an approved request is spent exactly once
    (``request_used`` afterwards). ``consume=False`` only reports the state.
    """
    _require_enabled()
    with transaction.atomic():
        row = _lookup(public_id, user=user, lock=True)
        if not hmac.compare_digest(row.collector_digest, _digest(str(collect_key or ''))):
            raise _invalid()
        if row.consumed_at is not None:
            raise MFAError('request_used', 'This sign-in request was already used.')
        if row.status == PhoneLoginRequest.STATUS_DENIED:
            return 'denied'
        if row.status == PhoneLoginRequest.STATUS_PENDING:
            return 'expired' if row.expires_at <= timezone.now() else 'pending'
        if consume:
            row.consumed_at = timezone.now()
            row.save(update_fields=['consumed_at', 'updated_at'])
        return 'approved'
