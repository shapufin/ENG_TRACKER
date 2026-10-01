"""Scorecard events → notifications (HBPR oversight and TL decision feedback).

Connected from ``TLScorecardPlugin.ready()`` only when the notifications plugin
is importable; nothing here runs, or is imported, without it.
"""
from django.db import transaction
from django.db.models.signals import post_save, pre_save

from .models import Absence, IdleFlag, Meeting, PIPRecord, PromotionFlag

_UID = 'tl_scorecard.notify'


def _notify(notification_cls, **context):
    # After commit, so a rolled-back write never notifies anyone.
    transaction.on_commit(lambda: notification_cls().dispatch(context))


def _track_status(sender, instance, **kwargs):
    old = None
    if instance.pk and not getattr(instance, '_skip_notifications', False):
        old = sender.objects.filter(pk=instance.pk).values_list('status', flat=True).first()
    instance._old_status = old


def _track_shared(sender, instance, **kwargs):
    old = None
    if instance.pk and not getattr(instance, '_skip_notifications', False):
        old = sender.objects.filter(pk=instance.pk).values_list('shared_at', flat=True).first()
    instance._old_shared_at = old


def _on_meeting_saved(sender, instance, created, **kwargs):
    from . import notification_types as types
    if getattr(instance, '_skip_notifications', False):
        return
    first_share = instance.shared_at is not None and getattr(instance, '_old_shared_at', None) is None
    if first_share and instance.counterparty_id:
        _notify(types.RecordShared, instance=instance)


def _on_pip_saved(sender, instance, created, **kwargs):
    from . import notification_types as types
    if getattr(instance, '_skip_notifications', False):
        return
    old = getattr(instance, '_old_status', None)
    if created and instance.status == 'draft':
        _notify(types.PipAwaitingApproval, instance=instance)
    elif old == 'draft' and instance.status in ('active', 'cancelled'):
        outcome = 'approved' if instance.status == 'active' else 'returned'
        _notify(types.PipDecided, instance=instance, outcome=outcome)
        if instance.status == 'active':
            _notify(types.PipStarted, instance=instance)
    elif old == 'active' and instance.status in ('completed', 'cancelled'):
        _notify(types.PipClosed, instance=instance)


def _on_promotion_saved(sender, instance, created, **kwargs):
    from . import notification_types as types
    if getattr(instance, '_skip_notifications', False):
        return
    if created:
        _notify(types.PromotionNominated, instance=instance)
    elif getattr(instance, '_old_status', None) == 'nominated' and instance.status != 'nominated':
        _notify(types.PromotionDecided, instance=instance)


def _flag_receiver(kind):
    def receiver(sender, instance, created, **kwargs):
        from . import notification_types as types
        if created and not getattr(instance, '_skip_notifications', False):
            _notify(types.FlagRaised, instance=instance, kind=kind)
    return receiver


_on_idle_saved = _flag_receiver('idle')
_on_absence_saved = _flag_receiver('absence')

# (signal, sender, handler, uid suffix) — the single list connect/disconnect share.
_RECEIVERS = (
    (pre_save, Meeting, _track_shared, 'meeting_state'),
    (post_save, Meeting, _on_meeting_saved, 'meeting'),
    (pre_save, PIPRecord, _track_status, 'pip_state'),
    (post_save, PIPRecord, _on_pip_saved, 'pip'),
    (pre_save, PromotionFlag, _track_status, 'promotion_state'),
    (post_save, PromotionFlag, _on_promotion_saved, 'promotion'),
    (post_save, IdleFlag, _on_idle_saved, 'idle'),
    (post_save, Absence, _on_absence_saved, 'absence'),
)


def connect():
    # Registers the types as a side effect of importing them.
    from . import notification_types  # noqa: F401
    for signal, sender, handler, suffix in _RECEIVERS:
        signal.connect(handler, sender=sender, dispatch_uid=f'{_UID}.{suffix}', weak=False)


def disconnect():
    for signal, sender, _handler, suffix in _RECEIVERS:
        signal.disconnect(sender=sender, dispatch_uid=f'{_UID}.{suffix}')
