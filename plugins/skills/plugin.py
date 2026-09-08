"""Skills Matrix plugin definition."""
from core.plugins.base import BasePlugin
from .urls import urlpatterns


class SkillsPlugin(BasePlugin):
    @property
    def name(self) -> str:
        return "skills"

    @property
    def verbose_name(self) -> str:
        return "Skills Matrix"

    @property
    def description(self) -> str:
        return (
            "Employee skill self-assessment with admin-managed catalog, "
            "TL team matrix view, gap analysis, and audit history."
        )

    @property
    def version(self) -> str:
        return "1.0.0"

    def get_urls(self):
        return urlpatterns

    def get_permission_actions(self):
        return ["view", "manage", "configure", "export"]

    def get_permission_manifest(self):
        return {
            **super().get_permission_manifest(),
            # view is public=True so legacy users without UserRole rows can
            # access self-service endpoints (matches organigrama pattern).
            # UserSkillViewSet maps ALL its actions (including writes) to
            # 'view' via permission_action_map, so self-service works.
            # Catalog ViewSets use default mapping (writes → manage, HR-only).
            "view": {
                "roles": ["employee", "hr", "italian_tl", "albanian_tl", "cr_admin"],
                "public": True,
            },
            "manage": {"roles": ["hr"], "public": False},
            "configure": {"roles": ["hr"], "public": False},
            # export is public=True so TLs can export their team matrix.
            # The SkillExportViewSet uses GET (safe method → view by default),
            # but the export action is available for future fine-grained control.
            "export": {
                "roles": ["hr", "italian_tl", "albanian_tl"],
                "public": True,
            },
        }

    def get_frontend_metadata(self):
        metadata = super().get_frontend_metadata()
        metadata.update({
            "routes": [
                {
                    "path": "/skills",
                    "component": "MySkillsPage",
                    "layout": "app",
                },
                {
                    "path": "/skills/team",
                    "component": "SkillsTeamPage",
                    "layout": "app",
                },
                {
                    "path": "/skills/history",
                    "component": "SkillsHistoryPage",
                    "layout": "app",
                },
                {
                    "path": "/admin/skills/catalog",
                    "component": "SkillsCatalogPage",
                    "layout": "admin",
                },
            ],
            "injection_slots": [
                {
                    "slot": "sidebar-nav",
                    "component": "SkillsSidebarItem",
                },
            ],
        })
        return metadata

    def ready(self):
        """Connect audit signals when plugin is enabled.

        Called by ``plugin_registry.activate_plugin()`` only when the plugin
        is being activated. This ensures signals are NOT connected on every
        Django startup for a disabled plugin (which would happen if they
        were connected in ``apps.py ready()``).
        """
        from . import signals  # noqa: F401 — connects via dispatch_uid

    def disable(self):
        """Disconnect audit signals when plugin is disabled."""
        from django.db.models.signals import pre_save, post_save, pre_delete
        from .models import UserSkill
        pre_save.disconnect(
            sender=UserSkill,
            dispatch_uid='skills.track_rating_state',
        )
        post_save.disconnect(
            sender=UserSkill,
            dispatch_uid='skills.log_rating_change',
        )
        pre_delete.disconnect(
            sender=UserSkill,
            dispatch_uid='skills.log_rating_delete',
        )
