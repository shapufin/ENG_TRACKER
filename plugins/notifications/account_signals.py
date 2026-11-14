"""Tell every superuser when a user is erased through the superuser override."""
from django.contrib.auth import get_user_model

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


def connect():
    user_erased.connect(user_erased_notification, dispatch_uid=DISPATCH_UID)


def disconnect():
    user_erased.disconnect(dispatch_uid=DISPATCH_UID)
