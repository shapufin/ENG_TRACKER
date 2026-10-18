from django.apps import AppConfig


class AnalyticsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'plugins.analytics'
    verbose_name = 'Analytics Plugin'

    def ready(self):
        # OpenAPI enum name is plugin-owned so config/settings.py never
        # references this package (see docs/workflow-invariants.md).
        from django.conf import settings

        overrides = settings.SPECTACULAR_SETTINGS.setdefault('ENUM_NAME_OVERRIDES', {})
        overrides['SnapshotFrequencyEnum'] = f'{self.name}.models.AnalyticsSnapshot.SNAPSHOT_TYPES'
