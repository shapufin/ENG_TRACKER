from core.plugins.base import BasePlugin
from django.urls import path, include
from .viewsets import NotificationViewSet
from rest_framework.routers import DefaultRouter

class NotificationPlugin(BasePlugin):
    @property
    def name(self) -> str:
        return "notifications"

    @property
    def verbose_name(self) -> str:
        return "Notifications System"

    @property
    def description(self) -> str:
        return "Real-time notification system for leave requests, overtime, and standby logs."

    @property
    def version(self) -> str:
        return "1.0.0"

    def get_urls(self):
        router = DefaultRouter()
        router.register(r'notifications', NotificationViewSet, basename='notification')
        return [path('', include(router.urls))]

    def get_permission_actions(self):
        # NotificationViewSet does not use PluginPermissionMixin — all write
        # endpoints (mark_read, preferences, subscribe, unsubscribe) are
        # self-service on the user's own data. Only "view" has a real effect:
        # it controls whether the plugin appears in active_metadata for the
        # frontend nav. "manage" is not enforced and should not be shown.
        return ["view"]

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
                    "path": "/notifications",
                    "component": "NotificationsPage",
                    "layout": "app"
                }
            ],
            "injection_slots": [
                {
                    "slot": "sidebar",
                    "component": "NotificationBell"
                }
            ]
        })
        return metadata

    def ready(self):
        # Import signal handlers only after the plugin is enabled and initialized.
        from . import period_close_signals, signals

        signals.connect()
        period_close_signals.connect()

    def disable(self):
        from django.db.models.signals import post_delete, post_save, pre_save

        from apps.leave_management.models import LeaveRequest
        from apps.overtime.models import OvertimeLog
        from apps.standby.models import StandbyLog
        from apps.users.models import ApprovalPeriodClose
        pre_save.disconnect(
            sender=LeaveRequest,
            dispatch_uid='notifications.track_leave_request_state',
        )
        post_save.disconnect(
            sender=LeaveRequest,
            dispatch_uid='notifications.leave_request_notification',
        )
        post_delete.disconnect(
            sender=LeaveRequest,
            dispatch_uid='notifications.leave_request_deleted',
        )
        pre_save.disconnect(
            sender=OvertimeLog,
            dispatch_uid='notifications.track_overtime_state',
        )
        post_save.disconnect(
            sender=OvertimeLog,
            dispatch_uid='notifications.overtime_log_notification',
        )
        pre_save.disconnect(
            sender=StandbyLog,
            dispatch_uid='notifications.track_standby_state',
        )
        post_save.disconnect(
            sender=StandbyLog,
            dispatch_uid='notifications.standby_log_notification',
        )
        post_save.disconnect(
            sender=ApprovalPeriodClose,
            dispatch_uid='notifications.approval_period_close_notification',
        )
