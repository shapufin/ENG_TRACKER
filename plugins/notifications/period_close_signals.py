"""Notifications emitted when a TL finalizes an approval period."""
from __future__ import annotations

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.users.models import ApprovalPeriodClose


@receiver(
    post_save,
    sender=ApprovalPeriodClose,
    dispatch_uid='notifications.approval_period_close_notification',
)
def approval_period_close_notification(sender, instance, created, **kwargs):
    if not created:
        return

    def deliver():
        from .types.period_finalized import PeriodFinalizedNotification
        close = (
            ApprovalPeriodClose.objects.select_related('boundary')
            .prefetch_related('members__user')
            .get(pk=instance.pk)
        )
        PeriodFinalizedNotification().dispatch({'close': close})

    transaction.on_commit(deliver)


def connect():
    """Connect the period-close handler idempotently."""
    post_save.connect(
        approval_period_close_notification,
        sender=ApprovalPeriodClose,
        dispatch_uid='notifications.approval_period_close_notification',
    )
