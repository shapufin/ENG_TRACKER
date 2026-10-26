from django.apps import AppConfig


class OvertimeConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.overtime'

    def ready(self):
        from django.db.models.signals import post_delete, pre_delete

        from .models import Client, OvertimeLog
        from .paid_blocks import recalculate_after_delete
        from .signals import block_client_delete_with_kept_records

        post_delete.connect(
            recalculate_after_delete, sender=OvertimeLog,
            dispatch_uid='overtime_paid_blocks_after_delete',
        )
        pre_delete.connect(
            block_client_delete_with_kept_records, sender=Client,
            dispatch_uid='overtime_client_delete_guard',
        )
