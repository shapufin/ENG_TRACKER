"""
Onboarding plugin definition — per-client document repository.
"""

from core.plugins.base import BasePlugin
from .office_integration import office_editor_enabled
from .urls import urlpatterns


class OnboardingPlugin(BasePlugin):
    @property
    def name(self) -> str:
        return "onboarding"

    @property
    def verbose_name(self) -> str:
        return "Onboarding"

    @property
    def description(self) -> str:
        return (
            "Per-client document repository for employees and team leaders — "
            "folders and files scoped to each user's own assigned clients."
        )

    @property
    def version(self) -> str:
        return "1.0.0"

    def get_urls(self):
        return urlpatterns

    def get_permission_actions(self):
        return ["view", "manage", "export"]

    def get_permission_manifest(self):
        return {
            **super().get_permission_manifest(),
            "view": {"roles": [], "public": True},
            "manage": {"roles": [], "public": True},
            # Download a ZIP of the clients the user is assigned to (still scoped
            # to their own clients in the viewset).
            "export": {"roles": [], "public": True},
        }

    def get_scheduled_jobs(self):
        return [
            ("process_exports", 10, "plugins.onboarding.services.exporter.process_client_exports"),
            ("cleanup_exports", 3600, "plugins.onboarding.services.exporter.cleanup_expired_exports"),
        ]

    def get_frontend_metadata(self):
        metadata = super().get_frontend_metadata()
        metadata.update({
            "routes": [
                {
                    "path": "/onboarding",
                    "component": "OnboardingPage",
                    "layout": "app",
                },
                {
                    "path": "/onboarding/documents/:id/edit",
                    "component": "DocumentEditorPage",
                    "layout": "app",
                },
            ],
            "injection_slots": [
                {
                    "slot": "sidebar-nav",
                    "component": "OnboardingSidebarLink",
                    "section": "leadership",
                },
            ],
            "settings": {
                "office_editor_enabled": office_editor_enabled(),
            },
        })
        return metadata
