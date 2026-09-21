from django.apps import AppConfig


class EngagementConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'plugins.engagement'
    verbose_name = 'TL Engagement Metrics Plugin'

    def ready(self):
        pass
