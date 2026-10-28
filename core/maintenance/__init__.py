"""Site-wide maintenance mode.

``state`` is the single source of truth; ``authentication`` enforces it on
every DRF request; ``exceptions`` defines the 503 contract.
"""

from .exceptions import MaintenanceModeActive
from .state import (
    clear_maintenance_cache,
    get_maintenance_state,
    is_maintenance_active,
    is_user_exempt,
)
# Imported for its side effect: registers the OpenAPI security schemes for the
# authenticators above. drf_spectacular discovers extensions by import, and
# without this every view warns "could not resolve authenticator".
from . import schema as _schema  # noqa: F401,E402

__all__ = [
    'MaintenanceModeActive',
    'clear_maintenance_cache',
    'get_maintenance_state',
    'is_maintenance_active',
    'is_user_exempt',
]
