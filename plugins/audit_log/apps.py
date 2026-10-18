from django.apps import AppConfig


class AuditLogConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'plugins.audit_log'
    verbose_name = 'Audit Log Plugin'

    def ready(self):
        # OpenAPI enum name is plugin-owned so config/settings.py never
        # references this package (see docs/workflow-invariants.md).
        from django.conf import settings

        overrides = settings.SPECTACULAR_SETTINGS.setdefault('ENUM_NAME_OVERRIDES', {})
        overrides['PluginAuditActionEnum'] = f'{self.name}.models.AuditLog.ACTION_TYPES'
