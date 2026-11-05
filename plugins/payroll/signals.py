"""Early payroll finalize: when a leader closes a scope, check whether everyone is closed."""
import logging

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.users.models import ApprovalPeriodClose

logger = logging.getLogger(__name__)
DISPATCH_UID = 'payroll.advance_period_on_close'


def advance_period_after_close(close_id):
    """Run after the leader's close committed: a failure here must never reach their request."""
    from .services.payroll_service import advance_payroll_period

    try:
        close = ApprovalPeriodClose.objects.select_related('boundary').get(pk=close_id)
        advance_payroll_period(close.period.year, close.period.month)
    except Exception:
        logger.exception('Payroll advance after approval-period close %s failed.', close_id)


@receiver(post_save, sender=ApprovalPeriodClose, dispatch_uid=DISPATCH_UID)
def advance_period_on_close(sender, instance, created, **kwargs):
    # The system's own cutoff close is handled by the scheduler tick.
    if not created or instance.scope_type == 'auto_cutoff':
        return
    transaction.on_commit(lambda: advance_period_after_close(instance.pk))


def connect():
    post_save.connect(advance_period_on_close, sender=ApprovalPeriodClose, dispatch_uid=DISPATCH_UID)


def disconnect():
    post_save.disconnect(sender=ApprovalPeriodClose, dispatch_uid=DISPATCH_UID)
