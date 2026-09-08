"""
Admin configuration for the permissions app.

IMPORTANT — read before editing:
The custom RBAC models in apps.permissions.models are INTENTIONALLY NOT
registered in the Django admin. They are managed via the permissions REST
API viewsets at /api/permissions/... (see apps/permissions/viewsets.py and
apps/permissions/urls.py), not Django admin.

Status summary (see .devin/context/01-PERMISSIONS.md for full detail):
- LIVE: Role, UserRole (cr_admin), Permission, RolePermission,
  Group, UserGroup (calendar workspace + plugin access scoping).
- DORMANT: GroupPermission, TeamPermission, PermissionDelegation,
  PermissionSet, PermissionSetItem (removed by migration 0005).

Database role assignments are managed through the `/admin/users` role form and
`UserRole` API. Legacy UserProfile role flags remain only as a dual-read
compatibility bridge; Django's `is_staff` / `is_superuser` remain built-ins.

Django's built-in auth.Group is unregistered below because its per-model
auth.Permission checkboxes (overtimelog.add, standbylog.change, ...) are
NOT used by this project's enforcement code and only mislead
administrators into thinking they can grant permissions there.
"""
from django.contrib import admin
from django.contrib.auth.models import Group as AuthGroup

# Unregister Django's built-in auth.Group — its permission-checkbox editor
# is dead UI for this project (enforcement uses UserProfile flags, not
# auth.Permission). Idempotent: safe if already unregistered or not registered.
try:
    admin.site.unregister(AuthGroup)
except admin.sites.NotRegistered:
    pass
