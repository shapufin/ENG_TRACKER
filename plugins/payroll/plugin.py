"""
Payroll plugin definition.

Admin-only modular payroll plugin for the Engineering Tracker. Owns
effective-dated wage assignments, versioned Albanian payroll rules,
an authoritative work calendar, and monthly payroll runs with
draft → finalize workflow. Reuses existing users, approved overtime,
approved standby, and core team data.
"""
from core.plugins.base import BasePlugin
from .urls import urlpatterns


class PayrollPlugin(BasePlugin):
    @property
    def name(self) -> str:
        return "payroll"

    @property
    def verbose_name(self) -> str:
        return "Payroll Plugin"

    @property
    def description(self) -> str:
        return (
            "Albania payroll calculation: wage assignments, monthly gross-to-net "
            "payroll runs with overtime and standby, work calendar, and payslip exports."
        )

    @property
    def version(self) -> str:
        return "1.0.0"

    def get_urls(self):
        return urlpatterns

    def get_permission_actions(self):
        return ["view", "manage", "configure", "export"]

    def get_permission_manifest(self):
        # Admin-only initially. Future roles can be granted through the
        # permission UI without changing this manifest.
        return {
            **super().get_permission_manifest(),
            "view": {"roles": [], "public": False},
            "manage": {"roles": [], "public": False},
            "configure": {"roles": [], "public": False},
            "export": {"roles": [], "public": False},
        }

    def get_frontend_metadata(self):
        metadata = super().get_frontend_metadata()
        metadata.update({
            "routes": [
                {
                    "path": "/admin/payroll/wages",
                    "component": "PayrollWagesPage",
                    "layout": "admin",
                },
                {
                    "path": "/admin/payroll/runs",
                    "component": "PayrollRunsPage",
                    "layout": "admin",
                },
                {
                    "path": "/admin/payroll/runs/:id",
                    "component": "PayrollRunDetailPage",
                    "layout": "admin",
                },
                {
                    "path": "/admin/payroll/calendar",
                    "component": "PayrollCalendarPage",
                    "layout": "admin",
                },
                {
                    "path": "/admin/payroll/settings",
                    "component": "PayrollSettingsPage",
                    "layout": "admin",
                },
            ],
        })
        return metadata

    def get_config_schema(self):
        return {
            "currency": {
                "type": "string",
                "enum": ["ALL", "EUR", "USD"],
                "default": "ALL",
                "description": "Payroll currency",
            },
            "weekday_standby_hourly_rate": {
                "type": "number",
                "default": 0,
                "description": "Lek per hour for standby on weekdays (Mon–Fri)",
            },
            "weekend_standby_hourly_rate": {
                "type": "number",
                "default": 0,
                "description": "Lek per hour for standby on weekends (Sat–Sun)",
            },
            "earning_type_flags": {
                "type": "object",
                "description": "Taxable and contribution-bearing flags for overtime and standby",
            },
        }

    def validate_config(self, config):
        for field in ('weekday_standby_hourly_rate', 'weekend_standby_hourly_rate'):
            if field in config:
                rate = config[field]
                if not isinstance(rate, (int, float)) or rate < 0:
                    raise ValueError(f"{field} must be a non-negative number")
        return True

    def ready(self):
        """Initialize plugin when enabled. Phase 1: no signals."""

    def disable(self):
        """Cleanup when plugin is disabled. Phase 1: no signals."""
