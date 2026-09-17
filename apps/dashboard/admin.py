from django.contrib import admin
from .models import SiteBranding


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
