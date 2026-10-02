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
            # HBPR is read-only here: it participates only through the
            # approve/decide actions, which are mapped to `view` and gated in
            # code. Granting it `manage` would also open PATCH/DELETE.
            "view": {"roles": ["italian_tl", "albanian_tl", "hbpr"], "public": False},
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
                    "path": "/my-records",
                    "component": "MyRecordsPage",
                    "layout": "app",
                    # Employees hold no plugin grant; this page only ever shows
                    # their own records (see MyRecordsViewSet).
                    "self_service": True,
                },
                {
                    # The HBPR's own workspace: assignment-backed governance
                    # records, cadence and EPR evidence. Not /tl-scorecard —
                    # that is the Albanian TL's authoring page.
                    "path": "/hbpr",
                    "component": "HbprWorkspacePage",
                    "layout": "app",
                },
            ],
            "injection_slots": [
                {
                    "slot": "sidebar-nav",
                    "component": "TLScorecardSidebarLink",
                    "section": "leadership",
                },
                {
                    "slot": "sidebar-nav",
                    "component": "HbprSidebarLink",
                    "section": "leadership",
                },
                {
                    "slot": "sidebar-nav",
                    "component": "MyRecordsSidebarLink",
                    "self_service": True,
                },
                {
                    "slot": "hbpr-dashboard",
                    "component": "HbprDashboardPage",
                },
            ],
        })
        return metadata

    def ready(self):
        from . import signals
        try:
            signals.connect()
        except ImportError:
            pass  # notifications plugin not installed: the scorecard works without it

    def disable(self):
        from . import signals
        signals.disconnect()
