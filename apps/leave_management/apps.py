from django.apps import AppConfig


class LeaveManagementConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.leave_management'

    def ready(self):
        import apps.leave_management.models.core  # noqa: F401
