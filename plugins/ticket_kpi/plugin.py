"""
Ticket KPI Plugin definition.
"""

from core.plugins.base import BasePlugin
from .urls import urlpatterns


class TicketKPIPlugin(BasePlugin):
    @property
    def name(self) -> str:
        return "ticket_kpi"

    @property
    def verbose_name(self) -> str:
        return "Ticket KPI Upload"

    @property
    def description(self) -> str:
        return (
            "Allows users to upload monthly ticket export files from any ticketing system. "
            "Admin-configurable field mappings normalize data for KPI analytics: "
            "tickets closed, avg resolution time, SLA compliance, and category breakdown. "
            "End-of-year Excel/CSV export for team and management review."
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
            "view": {"roles": [], "public": True},
            "manage": {"roles": [], "public": True},
        }

    def get_frontend_metadata(self):
        metadata = super().get_frontend_metadata()
        metadata.update({
            "routes": [
                {
                    "path": "/ticket-kpi/upload",
                    "component": "TicketUploadPage",
                    "layout": "app"
                },
                {
                    "path": "/ticket-kpi/dashboard",
                    "component": "TicketKPIDashboardPage",
                    "layout": "app"
                },
                {
                    "path": "/ticket-kpi/team",
                    "component": "TicketKPITeamPage",
                    "layout": "app"
                },
                {
                    "path": "/ticket-kpi/team-management",
                    "component": "TicketKPITeamManagementPage",
                    "layout": "app"
                },
                {
                    "path": "/admin/ticket-kpi/mappings",
                    "component": "TicketKPIAdminPage",
                    "layout": "admin"
                },
            ]
        })
        return metadata

    def get_config_schema(self):
        return {
            "default_profile_id": {
                "type": "integer",
                "default": None,
                "description": "Default export profile ID for new users"
            },
            "sla_threshold_hours": {
                "type": "integer",
                "default": 24,
                "description": "Hours threshold for auto-detecting SLA breaches"
            },
            "max_file_size_mb": {
                "type": "integer",
                "default": 10,
                "description": "Maximum upload file size in MB"
            },
            "retention_months": {
                "type": "integer",
                "default": 24,
                "description": "How many months of ticket data to retain"
            }
        }

    def validate_config(self, config):
        if 'sla_threshold_hours' in config:
            if not isinstance(config['sla_threshold_hours'], int) or config['sla_threshold_hours'] < 1:
                raise ValueError("sla_threshold_hours must be a positive integer")
        if 'max_file_size_mb' in config:
            if not isinstance(config['max_file_size_mb'], int) or config['max_file_size_mb'] < 1:
                raise ValueError("max_file_size_mb must be a positive integer")
        return True

    def ready(self):
        """Connect signals when plugin is enabled.

        Called by ``plugin_registry.activate_plugin()`` only when the plugin
        is being activated. This ensures signals are NOT connected on every
        Django startup for a disabled plugin (which would happen if they
        were connected in ``apps.py ready()``).
        """
        from . import signals  # noqa: F401

    def disable(self):
        """Disconnect signals when plugin is disabled."""
        from django.db.models.signals import post_save, post_delete
        from .models import TicketImportBatch
        from .signals import (
            compute_kpi_on_import,
            delete_kpi_on_batch_remove,
            auto_match_links_on_batch_import,
        )
        post_save.disconnect(compute_kpi_on_import, sender=TicketImportBatch)
        post_delete.disconnect(delete_kpi_on_batch_remove, sender=TicketImportBatch)
        post_save.disconnect(auto_match_links_on_batch_import, sender=TicketImportBatch)
