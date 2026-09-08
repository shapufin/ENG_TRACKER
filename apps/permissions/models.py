"""Compatibility re-export for the permissions model package.

The canonical model definitions live in ``apps.permissions.models.core``.
This module remains as a compatibility shim for older imports and intentionally
contains no model declarations.
"""

from .models.core import (
    Group,
    Permission,
    Role,
    RolePermission,
    UserGroup,
    UserRole,
)

__all__ = [
    "Group",
    "Permission",
    "Role",
    "RolePermission",
    "UserGroup",
    "UserRole",
]
