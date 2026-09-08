"""
Universal Data Import Plugin definition.
"""

from core.plugins.base import BasePlugin
from .urls import urlpatterns


class DataImportPlugin(BasePlugin):
    @property
    def name(self) -> str:
        return "data_import"

    @property
    def verbose_name(self) -> str:
        return "Universal Data Import"

    @property
    def description(self) -> str:
        return (
            "Admin tool to bulk-import Users, Leave Balances, and other data "
            "from CSV/Excel files exported from other systems, with dynamic "
            "column mapping — no fixed file format required."
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
                    "path": "/admin/data-import",
                    "component": "DataImportPage",
                    "layout": "admin"
                },
            ]
        })
        return metadata

    def get_config_schema(self):
        return {
            "max_rows_per_import": {
                "type": "integer",
                "default": 5000,
                "description": "Maximum number of rows allowed in a single import"
            },
            "max_file_size_mb": {
                "type": "integer",
                "default": 10,
                "description": "Maximum upload file size in MB"
            }
        }

    def validate_config(self, config):
        for key in ("max_rows_per_import", "max_file_size_mb"):
            if key in config:
                value = config[key]
                if not isinstance(value, int) or value < 1:
                    raise ValueError(f"{key} must be a positive integer")
        return True