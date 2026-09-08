from django.apps import AppConfig


class DataImportConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'plugins.data_import'
    verbose_name = 'Universal Data Import Plugin'