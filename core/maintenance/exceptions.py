"""503 contract for site-wide maintenance mode.

DRF's exception handler returns a dict ``detail`` verbatim
(``rest_framework/views.py``), so the body is exactly
``{"detail": "...", "code": "maintenance"}`` — the machine-readable marker the
SPA switches on. ``wait`` becomes the ``Retry-After`` header.
"""

from rest_framework.exceptions import APIException


class MaintenanceModeActive(APIException):
    status_code = 503
    default_code = 'maintenance'
    wait = 60
    default_detail = {
        'detail': 'The platform is under maintenance. Only administrators can sign in right now.',
        'code': 'maintenance',
    }
