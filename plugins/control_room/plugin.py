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
        return {
            "default_status_mode": {
                "type": "string",
                "enum": ["pending_approved", "approved_only", "all"],
                "default": "pending_approved",
                "description": "Which standby statuses the dashboard shows by default.",
            },
            "include_rejected": {
                "type": "boolean",
                "default": False,
                "description": "Whether rejected standby entries are visible by default.",
            },
        }

    def validate_config(self, config):
        valid_modes = {"pending_approved", "approved_only", "all"}
        if 'default_status_mode' in config and config['default_status_mode'] not in valid_modes:
            raise ValueError(
                f"default_status_mode must be one of {sorted(valid_modes)}"
            )
        if 'include_rejected' in config and not isinstance(config['include_rejected'], bool):
            raise ValueError("include_rejected must be a boolean")
        return True

    def ready(self):
        """Connect signals when plugin is enabled. Phase 1: no signals."""

    def disable(self):
        """Disconnect signals when plugin is disabled. Phase 1: no signals."""
