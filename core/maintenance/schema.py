"""OpenAPI schemes for the maintenance-aware authenticators.

drf_spectacular resolves security schemes by exact authenticator class, so the
wrappers must declare the same schemes as the classes they subclass or every
view emits a "could not resolve authenticator" warning (pinned by
``config.test_deployment.OpenAPISmokeTests``).
"""

from drf_spectacular.authentication import SessionScheme
from drf_spectacular.contrib.rest_framework_simplejwt import SimpleJWTScheme


class MaintenanceAwareJWTScheme(SimpleJWTScheme):
    target_class = 'core.maintenance.authentication.MaintenanceAwareJWTAuthentication'


class MaintenanceAwareSessionScheme(SessionScheme):
    target_class = 'core.maintenance.authentication.MaintenanceAwareSessionAuthentication'
