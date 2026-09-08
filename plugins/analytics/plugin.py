from core.plugins.base import BasePlugin
from rest_framework.routers import DefaultRouter
from .viewsets import (
    AnalyticsSnapshotViewSet,
    AnalyticsMetricViewSet,
    AnalyticsConfigurationViewSet,
    ScheduledReportViewSet,
    ReportTemplateViewSet,
)


class AnalyticsPlugin(BasePlugin):
    @property
    def name(self) -> str:
        return "analytics"

    @property
    def verbose_name(self) -> str:
        return "Analytics Plugin"

    @property
    def description(self) -> str:
        return "Dashboard analytics, metrics, charts, and insights for leave, overtime, and standby tracking."

    @property
    def version(self) -> str:
        return "1.0.0"

    def get_urls(self):
        router = DefaultRouter()
        router.register(r'snapshots', AnalyticsSnapshotViewSet, basename='analytics-snapshot')
        router.register(r'metrics', AnalyticsMetricViewSet, basename='analytics-metric')
        router.register(r'configuration', AnalyticsConfigurationViewSet, basename='analytics-configuration')
        router.register(r'scheduled-reports', ScheduledReportViewSet, basename='analytics-scheduled-report')
        router.register(r'templates', ReportTemplateViewSet, basename='analytics-template')
        return router.urls

    def get_permission_actions(self):
        return ["view", "manage", "export"]

    def get_permission_manifest(self):
        return super().get_permission_manifest()

    def get_frontend_metadata(self):
        metadata = super().get_frontend_metadata()
        metadata.update({
            "routes": [
                {
                    "path": "/analytics",
                    "component": "AnalyticsPage",
                    "layout": "app"
                },
                {
                    "path": "/admin/analytics",
                    "component": "AnalyticsPage",
                    "layout": "admin"
                }
            ],
            "injection_slots": [
                {
                    "slot": "sidebar-nav",
                    "component": "AnalyticsSidebarItem"
                },
                {
                    "slot": "admin-sidebar-nav",
                    "component": "AnalyticsAdminSidebarItem"
                }
            ]
        })
        return metadata

    def get_config_schema(self):
        return {
            "snapshot_frequency": {
                "type": "string",
                "enum": ["daily", "weekly", "monthly"],
                "default": "daily",
                "description": "How often to generate analytics snapshots"
            },
            "retention_days": {
                "type": "integer",
                "default": 90,
                "description": "How many days to retain analytics data"
            },
            "enable_metrics": {
                "type": "boolean",
                "default": True,
                "description": "Enable detailed metrics collection"
            }
        }

    def validate_config(self, config):
        if 'retention_days' in config:
            if not isinstance(config['retention_days'], int) or config['retention_days'] < 1:
                raise ValueError("retention_days must be a positive integer")
        return True

    def ready(self):
        """Initialize plugin when enabled."""
