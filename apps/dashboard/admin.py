from django.contrib import admin
from .models import SiteBranding, MaintenanceState


@admin.register(MaintenanceState)
class MaintenanceStateAdmin(admin.ModelAdmin):
    """Read-only view of the switch.

    The admin GUI owns the write path (``apply_update`` stamps ``started_at``
    and audits the change): a Django-admin save would arm the switch without a
    window, silently dropping the auto-expire safety net.
    """
    list_display = ['is_active', 'title', 'started_at', 'ends_at', 'updated_at']
    fields = ['is_active', 'title', 'message', 'started_at', 'ends_at', 'updated_by']
    readonly_fields = fields

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(SiteBranding)
class SiteBrandingAdmin(admin.ModelAdmin):
    """Admin interface for SiteBranding singleton."""
    list_display = ['site_name', 'has_logo']
    fields = ['site_name', 'logo']

    def has_add_permission(self, request):
        # Only allow one instance (singleton pattern)
        return not SiteBranding.objects.exists()

    def has_delete_permission(self, request, obj=None):
        # Prevent deletion of the singleton
        return False

    def has_logo(self, obj):
        return bool(obj.logo)
    has_logo.boolean = True
    has_logo.short_description = 'Logo'
