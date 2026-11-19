"""Pairing a phone to approve sign-ins (item 90). Step-up (password and code) is the view's job."""
import logging

from django.db import IntegrityError, transaction

from ..models.mfa import PairedPhone, PhoneLoginRequest, WebAuthnCredential
from .mfa import MFAError
from .phone_approval import _require_enabled
from .webauthn import NAME_MAX_LENGTH

logger = logging.getLogger(__name__)
DEFAULT_NAME = 'My phone'


def _clean_name(name: str) -> str:
    return (name or '').strip()[:NAME_MAX_LENGTH] or DEFAULT_NAME


def _push_endpoint(user, endpoint: str) -> str:
    """``endpoint`` if it is a stored push-service subscription of ``user``, else '' (QR only).

    The notifications plugin is imported lazily: ``apps.users`` never imports a plugin
    statically, and without it a phone simply pairs without push.
    """
    if not endpoint:
        return ''
    try:
        from plugins.notifications.models import PushSubscription
        from plugins.notifications.push_service import is_push_service_url
    except ImportError:
        return ''
    if not is_push_service_url(endpoint):
        return ''
    if not PushSubscription.objects.filter(user=user, endpoint=endpoint).exists():
        return ''
    return endpoint


def pair(user, credential_pk: int, name: str, push_endpoint: str = '') -> PairedPhone:
    """Pair one of the user's own passkeys (created on the phone) as an approver."""
    _require_enabled()
    credential = WebAuthnCredential.objects.filter(user=user, pk=credential_pk).first()
    if credential is None:
        raise MFAError('not_found', 'That passkey was not found.')
    try:
        with transaction.atomic():
            return PairedPhone.objects.create(
                user=user, credential=credential, name=_clean_name(name),
                push_endpoint=_push_endpoint(user, push_endpoint),
            )
    except IntegrityError as exc:
        raise MFAError('phone_exists', 'This phone is already set up to approve sign-ins.') from exc


def summary(phone: PairedPhone) -> dict:
    return {
        'id': phone.pk, 'name': phone.name, 'can_push': bool(phone.push_endpoint),
        'created_at': phone.created_at, 'last_used_at': phone.last_used_at,
    }


def list_phones(user) -> list[dict]:
    return [summary(phone) for phone in PairedPhone.objects.filter(user=user)]


def _own(user, phone_id: int) -> PairedPhone:
    phone = PairedPhone.objects.select_for_update().filter(user=user, pk=phone_id).first()
    if phone is None:
        raise MFAError('not_found', 'That phone was not found.')
    return phone


def rename(user, phone_id: int, name: str) -> PairedPhone:
    with transaction.atomic():
        phone = _own(user, phone_id)
        phone.name = _clean_name(name)
        phone.save(update_fields=['name', 'updated_at'])
    return phone


def remove(user, phone_id: int) -> None:
    """Unpair a phone. The passkey stays; live requests for the user are dropped."""
    with transaction.atomic():
        _own(user, phone_id).delete()
        PhoneLoginRequest.objects.filter(user=user).delete()


def remove_all(user) -> None:
    """Admin reset and ``reset_user_mfa``: every pairing and live request."""
    with transaction.atomic():
        PairedPhone.objects.filter(user=user).delete()
        PhoneLoginRequest.objects.filter(user=user).delete()
