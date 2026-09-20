from django.contrib import admin

from core.mixins.permissions import SuperuserOnlyAdminMixin
from .models import NotificationEventTypeConfig
from .types.base import get_all_types


@admin.register(NotificationEventTypeConfig)
class NotificationEventTypeConfigAdmin(SuperuserOnlyAdminMixin, admin.ModelAdmin):
    """Global on/off switch per notification event type.

    Rows are seeded by migration for all registered event types; event types
    added in code later show up here only after their config row is created
    (until then they behave as enabled via the missing-row fallback).
    """

    list_display = ['event_label', 'event_type', 'event_description', 'is_enabled']
    list_editable = ['is_enabled']
    list_display_links = ['event_type']
    search_fields = ['event_type']

    @admin.display(description='Event')
    def event_label(self, obj):
        notification_type = get_all_types().get(obj.event_type)
        return notification_type.label if notification_type else obj.event_type

    @admin.display(description='What it does')
    def event_description(self, obj):
        notification_type = get_all_types().get(obj.event_type)
        return notification_type.description if notification_type else ''

    def changelist_view(self, request, extra_context=None):
        # Auto-create config rows for event types registered in code but
        # not yet seeded, so admins can toggle everything from this list.
        # Missing rows default to enabled (missing-row fallback in signals).
        existing = set(
            NotificationEventTypeConfig.objects.values_list(
                'event_type', flat=True
            )
        )
        missing = [
            NotificationEventTypeConfig(event_type=event_type)
            for event_type in get_all_types()
            if event_type not in existing
        ]
        if missing:
            # ignore_conflicts: two concurrent admin page loads can both see
            # the same missing row and race to insert it (event_type is
            # unique). The loser re-reads the winner's row on next load.
            NotificationEventTypeConfig.objects.bulk_create(
                missing, ignore_conflicts=True
            )
        return super().changelist_view(request, extra_context)
