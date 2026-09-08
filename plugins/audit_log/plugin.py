from core.plugins.base import BasePlugin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .viewsets import AuditLogViewSet, AuditLogFilterViewSet


class AuditLogPlugin(BasePlugin):
    @property
    def name(self) -> str:
        return "audit_log"

    @property
    def verbose_name(self) -> str:
        return "Audit Log Plugin"

    @property
    def description(self) -> str:
        return "Track all user actions and data changes for compliance and auditing."

    @property
    def version(self) -> str:
        return "1.0.0"

    def get_urls(self):
        router = DefaultRouter()
        router.register(r'logs', AuditLogViewSet, basename='audit-log')
        router.register(r'filters', AuditLogFilterViewSet, basename='audit-log-filter')
        return [path('', include(router.urls))]

    def get_permission_actions(self):
        return ["view", "manage", "export"]

    def get_permission_manifest(self):
        return super().get_permission_manifest()

    def get_frontend_metadata(self):
        metadata = super().get_frontend_metadata()
        metadata.update({
            "routes": [
                {
                    "path": "/admin/audit-logs",
                    "component": "AuditLogPage",
                    "layout": "admin"
                }
            ],
            "injection_slots": [
                {
                    "slot": "admin-sidebar-nav",
                    "component": "AuditLogSidebarItem",
                }
            ]
        })
        return metadata

    def get_config_schema(self):
        return {
            "retention_days": {
                "type": "integer",
                "default": 365,
                "description": "How many days to retain audit logs"
            },
            "log_level": {
                "type": "string",
                "enum": ["all", "important", "critical"],
                "default": "all",
                "description": "What level of actions to log"
            },
            "enable_ip_logging": {
                "type": "boolean",
                "default": True,
                "description": "Log user IP addresses"
            },
            "enable_user_agent_logging": {
                "type": "boolean",
                "default": True,
                "description": "Log user agent information"
            }
        }

    def validate_config(self, config):
        if 'retention_days' in config:
            if not isinstance(config['retention_days'], int) or config['retention_days'] < 1:
                raise ValueError("retention_days must be a positive integer")
        return True

    def ready(self):
        """Initialize plugin when enabled."""
