from django.apps import AppConfig


class SiteBackupConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'plugins.site_backup'
    verbose_name = 'Site Backup & Restore Plugin'
