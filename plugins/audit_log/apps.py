from django.apps import AppConfig


class AuditLogConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'plugins.audit_log'
    verbose_name = 'Audit Log Plugin'
