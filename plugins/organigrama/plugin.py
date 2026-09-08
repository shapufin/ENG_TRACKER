"""
Organigrama plugin definition.

Read-only plugin that renders the company organizational hierarchy as a
people-centric tree: Italian TLs → Albanian TLs → Employees, with optional
independent technology grouping (Infrastructure, Backup, DB, etc.).

No models of its own — reads the users-domain Tech catalog, UserProfile TL
FKs, and real Team membership for scope. Scoping reuses get_team_member_ids().
"""
from core.plugins.base import BasePlugin
from .urls import urlpatterns


class OrganigramaPlugin(BasePlugin):
    @property
    def name(self) -> str:
        return "organigrama"

    @property
    def verbose_name(self) -> str:
        return "Organigrama"

    @property
    def description(self) -> str:
        return (
            "Read-only company organizational chart. Renders the hierarchy "
            "from existing Italian TL / Albanian TL assignments and optional "
            "team sub-structure. No new models or fields."
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
            "view": {
                "roles": ["employee", "italian_tl", "albanian_tl", "hr", "cr_admin"],
                # Public=True so the sidebar link and tree API are visible to
                # ALL authenticated users, including those without UserRole rows.
                # The org chart is read-only and scoped by get_team_member_ids(),
                # so there is no security risk. Without this, users with only
                # legacy role flags (is_hr_user, is_italian_tl_role, etc.) but
                # no UserRole rows would not see the link.
                "public": True,
            },
            "manage": {
                # Admin chart builder is staff/superuser only initially.
                # Staff and superusers bypass the plugin permission check, but
                # the action is declared so the admin UI can gate it explicitly.
                "roles": [],
                "public": False,
            },
        }

    def get_frontend_metadata(self):
        metadata = super().get_frontend_metadata()
        metadata.update({
            "routes": [
                {
                    "path": "/organigrama",
                    "component": "OrganigramaPage",
                    "layout": "app",
                },
                {
                    "path": "/admin/organigrama",
                    "component": "OrganigramaAdminPage",
                    "layout": "admin",
                },
                {
                    "path": "/admin/organigrama/:chartId/builder",
                    "component": "OrganigramaBuilderPage",
                    "layout": "admin",
                },
                {
                    "path": "/admin/organigrama/:chartId/publish",
                    "component": "OrganigramaPublishPage",
                    "layout": "admin",
                },
            ],
            "injection_slots": [
                {
                    "slot": "sidebar-nav",
                    "component": "OrganigramaSidebarItem",
                },
            ],
        })
        return metadata

    def ready(self):
        """No signals to connect for a read-only plugin."""
        pass

    def disable(self):
        """No signals to disconnect."""
        pass
