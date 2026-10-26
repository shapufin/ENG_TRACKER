"""
Authentication views for users app.
"""

from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from ..serializers import CustomTokenObtainPairSerializer
from ..services import mfa as mfa_service
from ..services.mfa import MFAError
from ..services.tokens import revoke_refresh_tokens


def set_refresh_cookie(response, refresh):
    """The one place the httpOnly refresh cookie is written (login, MFA, refresh)."""
    response.set_cookie(
        'refresh_token',
        refresh,
        httponly=True,
        secure=not settings.DEBUG,
        samesite='Lax',
        path='/api/auth/token/',
    )


class CustomTokenObtainPairView(TokenObtainPairView):
    """
    Custom token view that returns additional user data.

    Throttled via the ``auth`` scope to limit brute-force password attempts.
    A user who must still pass a second factor gets a challenge body instead of
    tokens (no ``refresh``, so no cookie is set).
    """
    serializer_class = CustomTokenObtainPairSerializer
    throttle_scope = 'auth'

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == status.HTTP_200_OK:
            refresh = response.data.pop('refresh', None)
            if refresh:
                set_refresh_cookie(response, refresh)
        return response


_MFA_STATUS = {
    'challenge_invalid': status.HTTP_401_UNAUTHORIZED,
    'invalid_password': status.HTTP_400_BAD_REQUEST,
    'invalid_code': status.HTTP_400_BAD_REQUEST,
    'locked': status.HTTP_429_TOO_MANY_REQUESTS,
    'unavailable': status.HTTP_503_SERVICE_UNAVAILABLE,
}


def _mfa_error(exc: MFAError) -> Response:
    return Response(
        {'detail': exc.message, 'code': exc.code},
        status=_MFA_STATUS.get(exc.code, status.HTTP_400_BAD_REQUEST),
    )


def _signed_in_response(user, extra=None) -> Response:
    data = CustomTokenObtainPairSerializer().issue(user)
    refresh = data.pop('refresh')
    if extra:
        data.update(extra)
    response = Response(data)
    set_refresh_cookie(response, refresh)
    return response


class _MFAView(APIView):
    """Second-factor endpoints that run before a session exists: no auth classes
    (so no CSRF/session handling), throttled by the ``mfa`` scope, and they
    prove identity with the signed challenge from the password step."""
    authentication_classes = ()
    permission_classes = (AllowAny,)
    throttle_scope = 'mfa'


@extend_schema(exclude=True)  # documented in docs/deploy; not part of the public schema
class MFAVerifyView(_MFAView):
    """POST /api/auth/token/mfa-verify/ {mfa_token, code}: finish an MFA login."""

    def post(self, request):
        try:
            user = mfa_service.read_challenge(
                str(request.data.get('mfa_token', '')), mfa_service.PURPOSE_VERIFY
            )
            mfa_service.verify_second_factor(user, str(request.data.get('code', '')))
        except MFAError as exc:
            return _mfa_error(exc)
        return _signed_in_response(user)


@extend_schema(exclude=True)  # documented in docs/deploy; not part of the public schema
class MFALoginSetupView(_MFAView):
    """POST /api/auth/mfa/login/setup/ {mfa_token}: seed + QR for a user who must enrol to sign in."""

    def post(self, request):
        try:
            user = mfa_service.read_challenge(
                str(request.data.get('mfa_token', '')), mfa_service.PURPOSE_SETUP
            )
            return Response(mfa_service.begin_setup(user))
        except MFAError as exc:
            return _mfa_error(exc)


@extend_schema(exclude=True)  # documented in docs/deploy; not part of the public schema
class MFALoginActivateView(_MFAView):
    """POST /api/auth/mfa/login/activate/ {mfa_token, code}: enrol and sign in. Backup codes ride along once."""

    def post(self, request):
        try:
            user = mfa_service.read_challenge(
                str(request.data.get('mfa_token', '')), mfa_service.PURPOSE_SETUP
            )
            codes = mfa_service.activate(user, str(request.data.get('code', '')))
        except MFAError as exc:
            return _mfa_error(exc)
        mfa_service.audit(user, 'mfa_enabled', f'{user.username} enrolled a second factor at sign-in', user)
        return _signed_in_response(user, {'backup_codes': codes})


class _SignedInMFAView(APIView):
    """Self-service MFA management for a signed-in user."""
    permission_classes = (IsAuthenticated,)
    throttle_scope = 'mfa'


@extend_schema(exclude=True)  # documented in docs/deploy; not part of the public schema
class MFAStatusView(_SignedInMFAView):
    """GET /api/auth/mfa/status/"""

    def get(self, request):
        return Response(mfa_service.status_for(request.user))


@extend_schema(exclude=True)  # documented in docs/deploy; not part of the public schema
class MFASetupView(_SignedInMFAView):
    """POST /api/auth/mfa/setup/ {password}: start enrolment (a stolen session alone cannot add a device)."""

    def post(self, request):
        if not request.user.check_password(str(request.data.get('password', ''))):
            return _mfa_error(MFAError('invalid_password', 'The password is not correct.'))
        try:
            return Response(mfa_service.begin_setup(request.user))
        except MFAError as exc:
            return _mfa_error(exc)


@extend_schema(exclude=True)  # documented in docs/deploy; not part of the public schema
class MFAActivateView(_SignedInMFAView):
    """POST /api/auth/mfa/activate/ {code}: confirm the first code; returns the backup codes once."""

    def post(self, request):
        try:
            codes = mfa_service.activate(request.user, str(request.data.get('code', '')))
        except MFAError as exc:
            return _mfa_error(exc)
        mfa_service.audit(request.user, 'mfa_enabled', f'{request.user.username} turned on two-factor authentication', request.user)
        return Response({'backup_codes': codes})


@extend_schema(exclude=True)  # documented in docs/deploy; not part of the public schema
class MFADisableView(_SignedInMFAView):
    """POST /api/auth/mfa/disable/ {password, code}: turn the factor off (not while it is required)."""

    def post(self, request):
        if mfa_service.required_source(request.user) is not None:
            return _mfa_error(MFAError(
                'required', 'Two-factor authentication is required for your account and cannot be turned off.'
            ))
        try:
            mfa_service.check_step_up(
                request.user, str(request.data.get('password', '')), str(request.data.get('code', ''))
            )
        except MFAError as exc:
            return _mfa_error(exc)
        mfa_service.remove_mfa(request.user)
        mfa_service.audit(request.user, 'mfa_disabled', f'{request.user.username} turned off two-factor authentication', request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(exclude=True)  # documented in docs/deploy; not part of the public schema
class MFABackupCodesView(_SignedInMFAView):
    """POST /api/auth/mfa/backup-codes/ {password, code}: replace the backup codes."""

    def post(self, request):
        if not mfa_service.is_enrolled(request.user):
            return _mfa_error(MFAError('not_enrolled', 'Two-factor authentication is not set up.'))
        try:
            mfa_service.check_step_up(
                request.user, str(request.data.get('password', '')), str(request.data.get('code', ''))
            )
        except MFAError as exc:
            return _mfa_error(exc)
        codes = mfa_service.generate_backup_codes(request.user)
        mfa_service.audit(request.user, 'mfa_backup_codes_regenerated', f'{request.user.username} regenerated backup codes', request.user)
        return Response({'backup_codes': codes})


@extend_schema(exclude=True)  # documented in docs/deploy; not part of the public schema
class PasswordChangeView(_SignedInMFAView):
    """POST /api/auth/password/change/ {current_password, new_password, code?}.

    Same step-up as the other credential changes (password, plus a second-factor
    code when enrolled) so a stolen session cannot take the account over. Every
    refresh token is revoked and this session gets a fresh one.
    """

    def post(self, request):
        user = request.user
        new_password = str(request.data.get('new_password') or '')
        current_password = str(request.data.get('current_password', ''))
        if not new_password:
            return Response({'detail': 'new_password is required.', 'code': 'invalid_password'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            mfa_service.check_step_up(user, current_password, str(request.data.get('code', '')))
        except MFAError as exc:
            return _mfa_error(exc)
        try:
            # The current password was just verified, so a plain comparison replaces a second slow hash.
            if new_password == current_password:
                raise DjangoValidationError('The new password must be different from the current one.')
            validate_password(new_password, user)
        except DjangoValidationError as exc:
            return Response(
                {'detail': 'Password does not meet the password policy.', 'messages': list(exc.messages)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.set_password(new_password)
        user.save(update_fields=['password'])
        revoke_refresh_tokens(user)
        mfa_service.audit(user, 'password_changed', f'{user.username} changed their password', user)
        return _signed_in_response(user)


class CustomTokenRefreshSerializer(TokenRefreshSerializer):
    """simplejwt looks the user up with ``objects.get``, so a refresh token whose
    user was deleted raised ``DoesNotExist`` (HTTP 500). Map it to the same 401
    an inactive account gets."""

    def validate(self, attrs):
        try:
            return super().validate(attrs)
        except get_user_model().DoesNotExist:
            raise AuthenticationFailed(
                self.error_messages['no_active_account'], 'no_active_account'
            )


class CustomTokenRefreshView(TokenRefreshView):
    """Token refresh view throttled via the ``auth`` scope (P1-2).

    Without this, an attacker with a stolen refresh token can hammer the
    refresh endpoint unlimited times. The ``auth: 20/min`` scope matches
    the login endpoint.
    """
    serializer_class = CustomTokenRefreshSerializer
    throttle_scope = 'auth'

    def post(self, request, *args, **kwargs):
        data = request.data.copy()
        data['refresh'] = request.COOKIES.get('refresh_token') or data.get('refresh')
        request._full_data = data
        response = super().post(request, *args, **kwargs)
        if response.status_code == status.HTTP_200_OK:
            refresh = response.data.pop('refresh', None)
            if refresh:
                set_refresh_cookie(response, refresh)
        return response


class TokenLogoutView(APIView):
    """Logout endpoint that blacklists the refresh token (P1-1).

    POST /api/auth/token/logout/ with ``{"refresh": "<token>"}`` and a
    valid ``Authorization: Bearer <access>`` header. The refresh token is
    blacklisted so it can no longer be used to obtain new access tokens.
    """

    permission_classes = [IsAuthenticated]
    throttle_scope = 'auth'

    @extend_schema(
        # The body is optional: the refresh token normally arrives in the
        # httpOnly cookie; ``refresh`` is the fallback read by post().
        request=inline_serializer(
            'TokenLogoutRequest',
            {'refresh': serializers.CharField(required=False)},
        ),
        responses={
            200: OpenApiResponse(description='Token blacklisted; refresh cookie cleared (empty body).'),
            400: inline_serializer(
                'TokenLogoutError', {'detail': serializers.CharField()}
            ),
        },
    )
    def post(self, request):
        refresh_token = request.COOKIES.get('refresh_token') or request.data.get('refresh')
        if not refresh_token:
            return Response(
                {'detail': 'refresh token is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except Exception:
            return Response(
                {'detail': 'invalid or already blacklisted refresh token'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        response = Response(status=status.HTTP_200_OK)
        response.delete_cookie('refresh_token', path='/api/auth/token/')
        return response
