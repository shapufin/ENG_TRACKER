from django.contrib.auth import get_user_model
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from apps.leave_management.models import LeaveRequest
from apps.overtime.models import OvertimeLog
from apps.standby.models import StandbyLog
from apps.users.models import Team

from .models import Notification, NotificationPreference
from .push_service import send_push_notification
# Importing types triggers __init_subclass__ registration of all types.
from .types import own, period_finalized, team  # noqa: F401

User = get_user_model()


# ============================================================================
# Shared helpers
# ============================================================================

def _preference_enabled(user, event_type, channel):
    preference = NotificationPreference.objects.filter(
        user=user, event_type=event_type
    ).first()
    return getattr(preference, f'{channel}_enabled', True) if preference else True


def _team_recipients(user):
    profile = getattr(user, 'profile', None)
    recipient_ids = set()
    if profile:
        recipient_ids.update(
            user_id for user_id in (profile.albanian_tl_id, profile.italian_tl_id) if user_id
        )
        recipient_ids.update(
            Team.objects.filter(
                members__user_id=user.id,
                team_leader__isnull=False,
            ).values_list('team_leader_id', flat=True)
        )
    return User.objects.filter(id__in=recipient_ids).distinct()


def _create_notification(
    user,
    title,
    message,
    event_type,
    notification_type='info',
    link=None,
    dedupe_key=None,
):
    """Deliver an event according to the recipient's saved preferences."""
    notification = None

    if _preference_enabled(user, event_type, 'in_app'):
        defaults = {
            'title': title,
            'message': message,
            'notification_type': notification_type,
            'link': link,
        }
        if dedupe_key:
            notification, _ = Notification.objects.get_or_create(
                user=user,
                dedupe_key=dedupe_key,
                defaults=defaults,
            )
        else:
            notification = Notification.objects.create(user=user, **defaults)

    if _preference_enabled(user, event_type, 'push'):
        try:
            send_push_notification(user, title, message, url=link)
        except Exception:
            pass  # Push is best-effort; in-app is the source of truth

    return notification


# ============================================================================
# Leave Request — pre_save state tracker
# ============================================================================

@receiver(pre_save, sender=LeaveRequest, dispatch_uid='notifications.track_leave_request_state')
def track_leave_request_state(sender, instance, **kwargs):
    if getattr(instance, '_skip_notifications', False):
        return
    if instance.pk:
        try:
            old = LeaveRequest.objects.get(pk=instance.pk)
            instance._old_status = old.status
            instance._old_values = {
                'start_date': old.start_date,
                'end_date': old.end_date,
                'request_type': old.request_type,
            }
        except LeaveRequest.DoesNotExist:
            instance._old_status = None
            instance._old_values = None
    else:
        instance._old_status = None
        instance._old_values = None


# ============================================================================
# Leave Request — post_save dispatcher
# ============================================================================

@receiver(post_save, sender=LeaveRequest, dispatch_uid='notifications.leave_request_notification')
def leave_request_notification(sender, instance, created, **kwargs):
    if getattr(instance, '_skip_notifications', False):
        return
    if created:
        own.LeaveSubmittedNotification().dispatch({'instance': instance})
        team.TeamActionRequiredNotification().dispatch({
            'instance': instance,
            'entity_type': 'leave',
        })
    else:
        old_status = getattr(instance, '_old_status', None)
        if old_status and old_status != instance.status:
            own.LeaveUpdatedNotification().dispatch({'instance': instance})

        old_values = getattr(instance, '_old_values', None)
        if old_values:
            changed_fields = []
            if old_values['start_date'] != instance.start_date:
                changed_fields.append('start_date')
            if old_values['end_date'] != instance.end_date:
                changed_fields.append('end_date')
            if old_values['request_type'] != instance.request_type:
                changed_fields.append('request_type')

            if changed_fields and old_status == instance.status:
                own.LeaveEditedNotification().dispatch({
                    'instance': instance,
                    'changed_fields': changed_fields,
                })


# ============================================================================
# Leave Request — post_delete dispatcher
# ============================================================================

@receiver(post_delete, sender=LeaveRequest, dispatch_uid='notifications.leave_request_deleted')
def leave_request_deleted(sender, instance, **kwargs):
    team.TeamLeaveDeletedNotification().dispatch({'instance': instance})


# ============================================================================
# Overtime Log — pre_save state tracker
# ============================================================================

@receiver(pre_save, sender=OvertimeLog, dispatch_uid='notifications.track_overtime_state')
def track_overtime_state(sender, instance, **kwargs):
    if getattr(instance, '_skip_notifications', False):
        return
    if instance.pk:
        try:
            old = OvertimeLog.objects.get(pk=instance.pk)
            instance._old_status = old.status
        except OvertimeLog.DoesNotExist:
            instance._old_status = None
    else:
        instance._old_status = None


# ============================================================================
# Overtime Log — post_save dispatcher
# ============================================================================

@receiver(post_save, sender=OvertimeLog, dispatch_uid='notifications.overtime_log_notification')
def overtime_log_notification(sender, instance, created, **kwargs):
    if getattr(instance, '_skip_notifications', False):
        return
    if created:
        own.OvertimeSubmittedNotification().dispatch({'instance': instance})
        team.TeamActionRequiredNotification().dispatch({
            'instance': instance,
            'entity_type': 'overtime',
        })
    else:
        old_status = getattr(instance, '_old_status', None)
        if old_status and old_status != instance.status:
            own.OvertimeUpdatedNotification().dispatch({'instance': instance})


# ============================================================================
# Standby Log — pre_save state tracker
# ============================================================================

@receiver(pre_save, sender=StandbyLog, dispatch_uid='notifications.track_standby_state')
def track_standby_state(sender, instance, **kwargs):
    if getattr(instance, '_skip_notifications', False):
        return
    if instance.pk:
        try:
            old = StandbyLog.objects.get(pk=instance.pk)
            instance._old_status = old.status
        except StandbyLog.DoesNotExist:
            instance._old_status = None
    else:
        instance._old_status = None


# ============================================================================
# Standby Log — post_save dispatcher
# ============================================================================

@receiver(post_save, sender=StandbyLog, dispatch_uid='notifications.standby_log_notification')
def standby_log_notification(sender, instance, created, **kwargs):
    if getattr(instance, '_skip_notifications', False):
        return
    if created:
        own.StandbySubmittedNotification().dispatch({'instance': instance})
        team.TeamActionRequiredNotification().dispatch({
            'instance': instance,
            'entity_type': 'standby',
        })
    else:
        old_status = getattr(instance, '_old_status', None)
        if old_status and old_status != instance.status:
            own.StandbyUpdatedNotification().dispatch({'instance': instance})


def connect():
    """Connect all notification signal handlers idempotently."""
    pre_save.connect(
        track_leave_request_state,
        sender=LeaveRequest,
        dispatch_uid='notifications.track_leave_request_state',
    )
    post_save.connect(
        leave_request_notification,
        sender=LeaveRequest,
        dispatch_uid='notifications.leave_request_notification',
    )
    post_delete.connect(
        leave_request_deleted,
        sender=LeaveRequest,
        dispatch_uid='notifications.leave_request_deleted',
    )
    pre_save.connect(
        track_overtime_state,
        sender=OvertimeLog,
        dispatch_uid='notifications.track_overtime_state',
    )
    post_save.connect(
        overtime_log_notification,
        sender=OvertimeLog,
        dispatch_uid='notifications.overtime_log_notification',
    )
    pre_save.connect(
        track_standby_state,
        sender=StandbyLog,
        dispatch_uid='notifications.track_standby_state',
    )
    post_save.connect(
        standby_log_notification,
        sender=StandbyLog,
        dispatch_uid='notifications.standby_log_notification',
    )
