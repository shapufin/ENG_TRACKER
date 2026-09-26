"""
TL Scorecard plugin definition — Phase 1 (see the approved plan for the
full phased roadmap). Pure computation over existing apps/* data, no models
of its own yet.
"""

from core.plugins.base import BasePlugin
from .urls import urlpatterns


class TlScorecardPlugin(BasePlugin):
    @property
    def name(self) -> str:
        return "tl_scorecard"

    @property
    def verbose_name(self) -> str:
        return "TL Scorecard"

    @property
    def description(self) -> str:
        return (
            "Team leader KPI scorecard — leave/overtime approval SLA, "
            "links to engagement and skills-matrix data, and a live "
            "coverage view of every KPI this tool measures, approximates, "
            "or has not yet built."
        )

    @property
    def version(self) -> str:
        return "1.0.0"

    def get_urls(self):
        return urlpatterns

    def get_permission_actions(self):
        return ["view", "manage", "configure"]

    def get_permission_manifest(self):
        return {
            **super().get_permission_manifest(),
            "view": {"roles": ["italian_tl", "albanian_tl"], "public": False},
            "manage": {"roles": ["italian_tl", "albanian_tl"], "public": False},
            # Reserved for engagement-survey submission only (see
            # EngagementSurveyResponseViewSet's docstring) — every
            # authenticated employee submits their own sentiment score,
            # not just TLs. 'view'/'manage' stay TL-only.
            "configure": {"roles": [], "public": True},
        }

    def get_frontend_metadata(self):
        metadata = super().get_frontend_metadata()
        metadata.update({
            "routes": [
                {
                    "path": "/tl-scorecard",
                    "component": "TLScorecardPage",
                    "layout": "app",
                },
                {
                    "path": "/tl-scorecard/visualize",
                    "component": "TLScorecardVisualizationPage",
                    "layout": "app",
                },
                {
                    "path": "/admin/tl-scorecard",
                    "component": "TLScorecardPage",
                    "layout": "admin",
                },
            ],
            "injection_slots": [
                {
                    "slot": "sidebar-nav",
                    "component": "TLScorecardSidebarLink",
                    "section": "leadership",
                },
                {
                    "slot": "admin-sidebar-nav",
                    "component": "TLScorecardAdminSidebarItem",
                },
            ],
        })
        return metadata
