"""
Site Backup & Restore plugin definition.
"""

from core.plugins.base import BasePlugin
from .urls import urlpatterns


class SiteBackupPlugin(BasePlugin):
    @property
    def name(self) -> str:
        return "site_backup"

    @property
    def verbose_name(self) -> str:
        return "Site Backup & Restore"

    @property
    def description(self) -> str:
        return (
            "Manual, admin-driven full-site backup (database + media) with a "
            "selective restore flow that previews what already exists per "
            "model before anything is written."
        )

    @property
    def version(self) -> str:
        return "1.0.0"

    def get_urls(self):
        return urlpatterns

    def get_permission_actions(self):
        return ["view", "manage"]

    def get_permission_manifest(self):
        return super().get_permission_manifest()

    def get_frontend_metadata(self):
        metadata = super().get_frontend_metadata()
        metadata.update({
            "routes": [
                {
                    "path": "/admin/backup-restore",
                    "component": "BackupRestorePage",
                    "layout": "admin",
                },
            ],
            "injection_slots": [
                {
                    "slot": "admin-sidebar-nav-system",
                    "component": "BackupSidebarItem",
                },
            ],
        })
        return metadata

    def get_config_schema(self):
        return {
            "max_upload_size_mb": {
                "type": "integer",
                "default": 500,
                "description": "Maximum size in MB for an uploaded restore archive",
            },
        }

    def validate_config(self, config):
        if "max_upload_size_mb" in config:
            value = config["max_upload_size_mb"]
            if not isinstance(value, int) or value < 1:
                raise ValueError("max_upload_size_mb must be a positive integer")
        return True
