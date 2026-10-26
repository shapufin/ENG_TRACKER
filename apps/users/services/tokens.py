"""Refresh-token revocation shared by every flow that must end live sessions."""

from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken


def revoke_refresh_tokens(user) -> None:
    """Blacklist every live outstanding refresh token of ``user`` (SEC-10).

    A password reset or an MFA reset changes who can sign in, so sessions that
    were opened before it must not survive it. Two queries however long the
    account's history is (every login and refresh leaves an OutstandingToken);
    expired tokens cannot refresh anyway, so they are skipped.
    """
    already = BlacklistedToken.objects.filter(token__user=user).values('token_id')
    live = OutstandingToken.objects.filter(user=user, expires_at__gt=timezone.now()).exclude(id__in=already)
    BlacklistedToken.objects.bulk_create(
        [BlacklistedToken(token=token) for token in live], ignore_conflicts=True
    )
