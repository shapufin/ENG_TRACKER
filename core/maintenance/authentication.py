"""DRF authentication classes that enforce maintenance mode.

This is the only place a JWT-authenticated request can be stopped: Django's
``AuthenticationMiddleware`` sees JWT users as anonymous, so a middleware
cannot guard the API. Swapping these into ``DEFAULT_AUTHENTICATION_CLASSES``
covers every viewset, including the ones that declare their own
``permission_classes``.

Anonymous requests return before the state is read, so public endpoints cost
nothing. ``force_authenticate`` in tests bypasses authenticators entirely —
gate tests must use real tokens.
"""

from rest_framework.authentication import SessionAuthentication
from rest_framework_simplejwt.authentication import JWTAuthentication

from .exceptions import MaintenanceModeActive
from .state import is_maintenance_active, is_user_exempt


def _enforce(user) -> None:
    if is_user_exempt(user):
        return
    if is_maintenance_active():
        raise MaintenanceModeActive()


class MaintenanceAwareJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is not None:
            _enforce(result[0])
        return result


class MaintenanceAwareSessionAuthentication(SessionAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is not None:
            _enforce(result[0])
        return result
