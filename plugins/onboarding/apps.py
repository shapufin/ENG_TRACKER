from django.apps import AppConfig


class OnboardingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'plugins.onboarding'
    verbose_name = 'Onboarding Plugin'

    def ready(self):
        # Connected here, not in plugin.py ready(): this is data hygiene, not a
        # feature. A Client delete cascades into Documents from core even when the
        # plugin is disabled, and those files must go too.
        from django.db.models.signals import post_delete

        from .models import Document
        from .signals import delete_document_file

        post_delete.connect(
            delete_document_file, sender=Document,
            dispatch_uid='onboarding_document_file_cleanup',
        )
