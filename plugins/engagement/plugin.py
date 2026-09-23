"""
TL Engagement Metrics plugin definition.
"""

from core.plugins.base import BasePlugin
from .urls import urlpatterns


class EngagementPlugin(BasePlugin):
    @property
    def name(self) -> str:
        return "engagement"

    @property
    def verbose_name(self) -> str:
        return "TL Engagement Metrics"

    @property
    def description(self) -> str:
        return (
            "Gives team leaders visibility into their own approval speed, volume, "
            "aging, and resubmission rate across leave, overtime, and standby "
            "requests, plus a composite engagement score."
        )

    @property
    def version(self) -> str:
        return "1.0.0"

    def get_urls(self):
        return urlpatterns

    def get_permission_actions(self):
        return ["view"]

    def get_permission_manifest(self):
        return {
            **super().get_permission_manifest(),
            "view": {"roles": ["italian_tl", "albanian_tl"], "public": False},
        }

    def get_frontend_metadata(self):
        metadata = super().get_frontend_metadata()
        metadata.update({
            "routes": [
                {
                    "path": "/engagement/metrics",
                    "component": "EngagementMetricsPage",
                    "layout": "app",
                },
                {
                    "path": "/engagement/visualize",
                    "component": "EngagementVisualizationPage",
                    "layout": "app",
                },
            ],
            "injection_slots": [
                {
                    "slot": "sidebar-nav",
                    "component": "EngagementSidebarLink",
                },
            ],
        })
        return metadata
