"""
Authentication views for users app.
"""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from django.conf import settings
from ..serializers import CustomTokenObtainPairSerializer


class CustomTokenObtainPairView(TokenObtainPairView):
    """
    Custom token view that returns additional user data.

    Throttled via the ``auth`` scope to limit brute-force password attempts.
    """
    serializer_class = CustomTokenObtainPairSerializer
    throttle_scope = 'auth'

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == status.HTTP_200_OK:
            refresh = response.data.pop('refresh', None)
            if refresh:
                response.set_cookie(
                    'refresh_token',
                    refresh,
                    httponly=True,
                    secure=not settings.DEBUG,
                    samesite='Lax',
                    path='/api/auth/token/',
                )
        return response


class CustomTokenRefreshView(TokenRefreshView):
    """Token refresh view throttled via the ``auth`` scope (P1-2).

    Without this, an attacker with a stolen refresh token can hammer the
    refresh endpoint unlimited times. The ``auth: 20/min`` scope matches
    the login endpoint.
    """
    throttle_scope = 'auth'

    def post(self, request, *args, **kwargs):
        data = request.data.copy()
        data['refresh'] = request.COOKIES.get('refresh_token') or data.get('refresh')
        request._full_data = data
        response = super().post(request, *args, **kwargs)
        if response.status_code == status.HTTP_200_OK:
            refresh = response.data.pop('refresh', None)
            if refresh:
                response.set_cookie(
                    'refresh_token',
                    refresh,
                    httponly=True,
                    secure=not settings.DEBUG,
                    samesite='Lax',
                    path='/api/auth/token/',
                )
        return response


class TokenLogoutView(APIView):
    """Logout endpoint that blacklists the refresh token (P1-1).

    POST /api/auth/token/logout/ with ``{"refresh": "<token>"}`` and a
    valid ``Authorization: Bearer <access>`` header. The refresh token is
    blacklisted so it can no longer be used to obtain new access tokens.
    """

    permission_classes = [IsAuthenticated]
    throttle_scope = 'auth'

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
