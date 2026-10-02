"""Scorecard events → notifications (HBPR oversight and TL decision feedback).

Connected from ``TLScorecardPlugin.ready()`` only when the notifications plugin
is importable; nothing here runs, or is imported, without it.
"""
from django.db import transaction
from django.db.models.signals import post_save

from apps.users.models.hbpr import HbprAlbanianTlAssignment

from .models import (
    Absence,
    EPRCycle,
    HbprGovernanceEvidence,
    IdleFlag,
    Meeting,
    PIPRecord,
    PromotionFlag,
    ReviewDelivery,
)

_UID = 'tl_scorecard.notify'


def _notify(notification_cls, **context):
    # After commit, so a rolled-back write never notifies anyone.
    transaction.on_commit(lambda: notification_cls().dispatch(context))


def _old(instance):
    """Tracked values as of load/last save (see ``TrackedFieldsMixin``), or {}."""
    return getattr(instance, '_old_fields', None) or {}


def _changed(instance, *fields):
    """True when an existing row changed any of ``fields`` since it was loaded."""
    old = _old(instance)
    return any(f in old and old[f] != getattr(instance, f) for f in fields)


def _on_meeting_saved(sender, instance, created, **kwargs):
    from . import notification_types as types
    if getattr(instance, '_skip_notifications', False):
        return
    # Governance meetings only: an employee one-on-one never reaches the HBPR.
    if instance.meeting_type != 'one_on_one' and (
        created or _changed(instance, 'occurred_on', 'shared_summary')
    ):
        _notify(types.HbprMeetingChanged, instance=instance)
    first_share = instance.shared_at is not None and _old(instance).get('shared_at') is None
    if first_share and instance.counterparty_id:
        _notify(types.RecordShared, instance=instance)


def _on_pip_saved(sender, instance, created, **kwargs):
    from . import notification_types as types
    if getattr(instance, '_skip_notifications', False):
        return
    old = _old(instance).get('status')
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
    elif _old(instance).get('status') == 'nominated' and instance.status != 'nominated':
        _notify(types.PromotionDecided, instance=instance)


def _flag_receiver(kind):
    def receiver(sender, instance, created, **kwargs):
        from . import notification_types as types
        if created and not getattr(instance, '_skip_notifications', False):
            _notify(types.FlagRaised, instance=instance, kind=kind)
    return receiver


_raise_idle = _flag_receiver('idle')
_raise_absence = _flag_receiver('absence')


def _on_idle_saved(sender, instance, created, **kwargs):
    from . import notification_types as types
    _raise_idle(sender, instance, created, **kwargs)
    if (
        not created and not getattr(instance, '_skip_notifications', False)
        and instance.status == 'resolved' and _changed(instance, 'status')
    ):
        _notify(types.FlagResolved, instance=instance, kind='idle')


def _on_absence_saved(sender, instance, created, **kwargs):
    from . import notification_types as types
    _raise_absence(sender, instance, created, **kwargs)
    if (
        not created and not getattr(instance, '_skip_notifications', False)
        and instance.addressed_on is not None and _changed(instance, 'addressed_on')
    ):
        _notify(types.FlagResolved, instance=instance, kind='absence')


_EPR_STAGES = ('goal_setting_completed_at', 'mid_year_completed_at', 'final_review_completed_at')


def _on_epr_saved(sender, instance, created, **kwargs):
    from . import notification_types as types
    old = _old(instance)
    if created or getattr(instance, '_skip_notifications', False):
        return
    for stage in _EPR_STAGES:
        if stage in old and old[stage] is None and getattr(instance, stage) is not None:
            _notify(types.EprStageCompleted, instance=instance, stage=stage)


def _on_assignment_saved(sender, instance, created, **kwargs):
    from . import notification_types as types
    if getattr(instance, '_skip_notifications', False):
        return
    if created:
        _notify(types.HbprAssignmentChanged, instance=instance, outcome='assigned')
    else:
        old = _old(instance)
        if 'effective_to' in old and old['effective_to'] is None and instance.effective_to is not None:
            _notify(types.HbprAssignmentChanged, instance=instance, outcome='ended')


def _on_hbpr_evidence_saved(sender, instance, created, **kwargs):
    """Tell the assigned HBPR when the AL TL records governance evidence."""
    from . import notification_types as types
    if getattr(instance, '_skip_notifications', False):
        return
    edited = not created and _changed(
        instance, 'occurred_on', 'shared_summary', 'action_items', 'reference_url')
    if not (created or edited):
        return
    cls = (
        types.HbprCadenceEvidenceRecorded
        if instance.kind == 'cadence_meeting' else types.HbprEprEvidenceRecorded
    )
    _notify(cls, instance=instance, edited=edited)


def _on_review_delivered(sender, instance, created, **kwargs):
    from . import notification_types as types
    if created and not getattr(instance, '_skip_notifications', False):
        _notify(types.HbprReviewDelivered, instance=instance)


# (signal, sender, handler, uid suffix) — the single list connect/disconnect share.
_RECEIVERS = (
    (post_save, EPRCycle, _on_epr_saved, 'epr'),
    (post_save, HbprAlbanianTlAssignment, _on_assignment_saved, 'assignment'),
    (post_save, Meeting, _on_meeting_saved, 'meeting'),
    (post_save, PIPRecord, _on_pip_saved, 'pip'),
    (post_save, PromotionFlag, _on_promotion_saved, 'promotion'),
    (post_save, IdleFlag, _on_idle_saved, 'idle'),
    (post_save, Absence, _on_absence_saved, 'absence'),
    (post_save, HbprGovernanceEvidence, _on_hbpr_evidence_saved, 'hbpr_evidence'),
    (post_save, ReviewDelivery, _on_review_delivered, 'review_delivery'),
)


def connect():
    # Registers the types as a side effect of importing them.
    from . import notification_types  # noqa: F401
    for signal, sender, handler, suffix in _RECEIVERS:
        signal.connect(handler, sender=sender, dispatch_uid=f'{_UID}.{suffix}', weak=False)


def disconnect():
    for signal, sender, _handler, suffix in _RECEIVERS:
        signal.disconnect(sender=sender, dispatch_uid=f'{_UID}.{suffix}')
