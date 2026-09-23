from django.contrib import admin

from .models import NotificationEventTypeConfig


@admin.register(NotificationEventTypeConfig)
class NotificationEventTypeConfigAdmin(admin.ModelAdmin):
    list_display = ('event_type', 'is_enabled', 'updated_at')
    list_editable = ('is_enabled',)
    ordering = ('event_type',)
