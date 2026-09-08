"""
Django admin interface for plugin management.
Plugin management is handled via React admin interface at /admin/plugins.
"""

from django.contrib import admin
from .models import Plugin


class PluginAdmin(admin.ModelAdmin):
    """Simple admin interface for Plugin model."""
    
    list_display = ['name', 'verbose_name', 'version', 'is_enabled']
    list_filter = ['is_enabled', 'created_at']
    search_fields = ['name', 'verbose_name', 'description']
    readonly_fields = ['name', 'created_at', 'updated_at']
    
    fieldsets = (
        ('Plugin Information', {
            'fields': ('name', 'verbose_name', 'version', 'description')
        }),
        ('Configuration', {
            'fields': ('is_enabled', 'config')
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


admin.site.register(Plugin, PluginAdmin)
