from django.contrib import admin
from core.mixins.permissions import SuperuserOnlyAdminMixin
from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(SuperuserOnlyAdminMixin, admin.ModelAdmin):
    list_display = [
        'timestamp',
        'user',
        'action',
        'content_type',
        'object_id',
        'status',
    ]
    list_filter = ['action', 'status', 'timestamp', 'user']
    search_fields = ['user__username', 'description', 'ip_address']
    date_hierarchy = 'timestamp'
    readonly_fields = ['timestamp', 'created_at', 'content_object']
    
    fieldsets = (
        ('User & Action', {
            'fields': ('user', 'action', 'description', 'status')
        }),
        ('Object', {
            'fields': ('content_type', 'object_id', 'content_object')
        }),
        ('Changes', {
            'fields': ('old_values', 'new_values'),
            'classes': ('collapse',)
        }),
        ('Request Info', {
            'fields': ('ip_address', 'user_agent'),
            'classes': ('collapse',)
        }),
        ('Timestamps', {
            'fields': ('timestamp', 'created_at'),
            'classes': ('collapse',)
        }),
    )


class AuditLogFilterAdmin(SuperuserOnlyAdminMixin, admin.ModelAdmin):
    list_display = [
        'name',
        'user',
        'action',
        'is_public',
        'created_at',
    ]
    list_filter = ['action', 'is_public', 'created_at']
    search_fields = ['name', 'user__username']
    date_hierarchy = 'created_at'
    readonly_fields = ['created_at', 'updated_at']
