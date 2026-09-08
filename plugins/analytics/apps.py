from django.apps import AppConfig


class AnalyticsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'plugins.analytics'
    verbose_name = 'Analytics Plugin'

    def ready(self):
        pass
