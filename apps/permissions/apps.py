from django.apps import AppConfig


class PermissionsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.permissions'
    
    def ready(self):
        """Import signals when app is ready."""
        from . import signals  # noqa: F401
