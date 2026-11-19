"""Validation of the passkey (WebAuthn) settings, shared by settings and tests."""
from urllib.parse import urlparse

from django.core.exceptions import ImproperlyConfigured


def parse_webauthn_settings(rp_id: str, origins: str, *, production: bool) -> tuple[str, list[str]]:
    """Return ``(rp_id, origins)`` or raise ``ImproperlyConfigured``.

    Both unset in production means passkeys are disabled (TOTP is unaffected), so a
    deploy that has not set them yet still boots. One set without the other, a
    non-HTTPS origin, or an RP ID that is not a host suffix of every origin refuses
    to boot: a wrong RP ID silently locks every passkey out.
    """
    rp_id = (rp_id or '').strip().lower()
    parsed = []
    for origin in (origins or '').split(','):
        origin = origin.strip().rstrip('/')
        if origin and origin not in parsed:
            parsed.append(origin)
    if production and not rp_id and not parsed:
        return '', []
    if not rp_id or not parsed:
        raise ImproperlyConfigured(
            'WEBAUTHN_RP_ID and WEBAUTHN_ORIGINS must be set together '
            '(e.g. tracker2.integrit.org and https://tracker2.integrit.org).'
        )
    for origin in parsed:
        url = urlparse(origin)
        host = (url.hostname or '').lower()
        if production and url.scheme != 'https':
            raise ImproperlyConfigured(f'WEBAUTHN_ORIGINS must be https in production, got {origin!r}.')
        if host != rp_id and not host.endswith('.' + rp_id):
            raise ImproperlyConfigured(
                f'WEBAUTHN_RP_ID {rp_id!r} must equal or be a parent domain of the host of {origin!r}.'
            )
    return rp_id, parsed


def parse_phone_approval_setting(raw, rp_id: str, origins) -> bool:
    """Whether phone approval sign-in is on (``PHONE_APPROVAL_ENABLED``).

    Off unless explicitly enabled. Enabled without the passkey settings refuses to
    boot: an approval is a passkey assertion, so it could never succeed.
    """
    enabled = str(raw or '').strip().lower() in ('1', 'true', 'yes', 'on')
    if enabled and not (rp_id and origins):
        raise ImproperlyConfigured(
            'PHONE_APPROVAL_ENABLED needs WEBAUTHN_RP_ID and WEBAUTHN_ORIGINS '
            '(phone approval is a passkey assertion).'
        )
    return enabled
