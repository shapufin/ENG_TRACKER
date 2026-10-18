"""
Control Room plugin definition.

Read-only scoped projection of existing standby data for designated
Control Room users. See `.devin/tracking/CONTROL_ROOM_PLUGIN_PLAN.md`
for the full architecture and rationale.
"""
from core.plugins.base import BasePlugin
from .urls import urlpatterns


class ControlRoomPlugin(BasePlugin):
    @property
    def name(self) -> str:
        return "control_room"

    @property
    def verbose_name(self) -> str:
        return "Control Room"

    @property
    def description(self) -> str:
        return (
            "Read-only dashboard showing who is on standby for each team a "
            "Control Room user is scoped to. Reuses existing users, teams, "
            "and standby logs; no second user system or standby model."
        )

    @property
    def version(self) -> str:
        return "1.0.0"

    def get_urls(self):
        return urlpatterns

    def get_permission_actions(self):
        return ["view", "manage"]

    def get_permission_manifest(self):
        return {
            **super().get_permission_manifest(),
            "view": {"roles": ["cr_admin"], "public": False},
            "manage": {"roles": ["cr_admin"], "public": False},
        }

    def get_frontend_metadata(self):
        metadata = super().get_frontend_metadata()
        metadata.update({
            "routes": [
                {
                    "path": "/control-room/dashboard",
                    "component": "ControlRoomDashboardPage",
                    "layout": "app",
                },
                {
                    "path": "/control-room/access",
                    "component": "ControlRoomAccessPage",
                    "layout": "app",
                },
                {
                    "path": "/admin/control-room/access",
                    "component": "ControlRoomAccessPage",
                    "layout": "admin",
                },
            ],
            "injection_slots": [
                {
                    "slot": "sidebar-nav",
                    "component": "ControlRoomSidebarItem",
                },
                {
                    "slot": "admin-sidebar-nav",
                    "component": "ControlRoomAdminSidebarItem",
                },
            ],
        })
        return metadata

    def get_config_schema(self):
        # The dashboard reads status_mode / include_rejected from query params;
        # no plugin-level config is consumed.
        return {}

    def ready(self):
        """Connect signals when plugin is enabled. Phase 1: no signals."""

    def disable(self):
        """Disconnect signals when plugin is disabled. Phase 1: no signals."""
