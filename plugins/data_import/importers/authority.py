"""
Per-target authority checks.

The plugin's ``manage`` grant says a user may use the import tool at all. It
must not imply they may import *every* target, so each importer re-applies the
authority its own admin surface already requires.
"""

from typing import Optional


class StaffOnlyAuthority:
    """Targets whose admin pages are staff/superuser-only (Users, Clients, ...)."""

    def check_authority(self, user) -> Optional[str]:
        if user and (user.is_staff or user.is_superuser):
            return None
        return f"Importing {self.display_name} requires administrator access."


class SkillsPluginAuthority:
    """Targets owned by the Skills plugin, gated by its own manage permission."""

    def check_authority(self, user) -> Optional[str]:
        if user and (user.is_staff or user.is_superuser):
            return None
        from apps.plugins.models import PluginPermission

        permission = PluginPermission.objects.filter(
            plugin_name="skills", action="manage"
        ).first()
        if permission is not None and permission.has_access(user):
            return None
        return f"Importing {self.display_name} requires the Skills manage permission."


class ControlRoomAuthority:
    """Control Room access grants, gated by the ``control_room:manage`` capability."""

    def check_authority(self, user) -> Optional[str]:
        if user and (user.is_staff or user.is_superuser):
            return None
        from apps.permissions.services import permission_service

        if permission_service.has_permission(user, "control_room", "manage"):
            return None
        return "Importing Control Room access requires the Control Room manage permission."
