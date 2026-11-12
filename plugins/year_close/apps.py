from django.apps import AppConfig


class YearCloseConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'plugins.year_close'
    verbose_name = 'Year Close Plugin'

    def ready(self):
        try:
            from . import notification_types  # noqa: F401  registers the removal notice
        except ImportError:  # pragma: no cover - notifications plugin not installed
            pass
