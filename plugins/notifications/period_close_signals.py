"""Notifications emitted when a TL finalizes an approval period."""
from __future__ import annotations

from datetime import date

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.users.models import ApprovalPeriodClose


def payroll_progress(period: date):
    """``{'closed', 'total', 'all_closed'}`` for the draft payroll run of
    ``period``, or ``None`` when payroll is absent or has no draft run.

    Optional-plugin import: only ``ImportError`` means "payroll not
    installed"; any other failure must surface.
    """
    try:
        from plugins.payroll.models import PayrollRun
        from plugins.payroll.services.payroll_service import get_period_closure_status
    except ImportError:
        return None
    run = PayrollRun.objects.filter(
        year=period.year, month=period.month, status='draft'
    ).first()
    if run is None:
        return None
    status = get_period_closure_status(run)
    return {
        'closed': status['closed_users'],
        'total': status['total_users'],
        'all_closed': status['all_closed'],
    }


def deliver_close_notifications(close_id):
    from .types.hr_period import HrPeriodReadyNotification, HrPeriodScopeClosedNotification
    from .types.period_finalized import PeriodFinalizedNotification

    close = (
        ApprovalPeriodClose.objects.select_related('boundary', 'closed_by')
        .prefetch_related('members__user')
        .get(pk=close_id)
    )
    PeriodFinalizedNotification().dispatch({'close': close})
    if close.scope_type == 'auto_cutoff':
        # The system's own cutoff close is not news for HR.
        return
    progress = payroll_progress(close.period)
    context = {'close': close}
    if progress:
        context['progress'] = (progress['closed'], progress['total'])
    HrPeriodScopeClosedNotification().dispatch(context)
    if progress and progress['total'] and progress['all_closed']:
        HrPeriodReadyNotification().dispatch(context)


@receiver(
    post_save,
    sender=ApprovalPeriodClose,
    dispatch_uid='notifications.approval_period_close_notification',
)
def approval_period_close_notification(sender, instance, created, **kwargs):
    if kwargs.get('raw') or not created:
        return
    transaction.on_commit(lambda: deliver_close_notifications(instance.pk))


def connect():
    """Connect the period-close handler idempotently."""
    post_save.connect(
        approval_period_close_notification,
        sender=ApprovalPeriodClose,
        dispatch_uid='notifications.approval_period_close_notification',
    )
