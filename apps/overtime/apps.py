from django.apps import AppConfig


class OvertimeConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.overtime'

    def ready(self):
        from django.db.models.signals import post_delete

        from .models import OvertimeLog
        from .paid_blocks import recalculate_after_delete

        post_delete.connect(
            recalculate_after_delete, sender=OvertimeLog,
            dispatch_uid='overtime_paid_blocks_after_delete',
        )
