"""Tell every superuser when a user is erased through the superuser override."""
from django.contrib.auth import get_user_model
from django.db.models.signals import post_save

from apps.users.services.user_deletion import user_erased

from .types.account import UserErasedNotification

DISPATCH_UID = 'notifications.user_erased_notification'


def user_erased_notification(sender, user_id, username, actor_id, reason, rows, **kwargs):
    actor = get_user_model().objects.filter(pk=actor_id).first()
    UserErasedNotification().dispatch({
        'user_id': user_id,
        'username': username,
        'actor_name': actor.get_full_name() or actor.username if actor else 'A superuser',
        'reason': reason,
        'rows': rows,
    })


DEACTIVATE_UID = 'notifications.deactivate_push_subscriptions'


def deactivate_push_subscriptions(sender, instance, created, raw=False, **kwargs):
    """A deactivated user must not keep receiving push notices (audit 2026-11-16 H4)."""
    if raw or created or instance.is_active:
        return
    from .models import PushSubscription
    PushSubscription.objects.filter(user=instance, is_active=True).update(is_active=False)


def connect():
    user_erased.connect(user_erased_notification, dispatch_uid=DISPATCH_UID)
    post_save.connect(deactivate_push_subscriptions, sender=get_user_model(), dispatch_uid=DEACTIVATE_UID)


def disconnect():
    user_erased.disconnect(dispatch_uid=DISPATCH_UID)
    post_save.disconnect(sender=get_user_model(), dispatch_uid=DEACTIVATE_UID)
