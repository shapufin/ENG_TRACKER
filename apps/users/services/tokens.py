"""Refresh-token revocation shared by every flow that must end live sessions."""

from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken


def revoke_refresh_tokens(user) -> None:
    """Blacklist every outstanding refresh token of ``user`` (SEC-10).

    A password reset or an MFA reset changes who can sign in, so sessions that
    were opened before it must not survive it.
    """
    for outstanding in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=outstanding)
