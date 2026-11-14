"""Account oversight notices for superusers."""
from django.contrib.auth import get_user_model

from .base import NotificationType


class UserErasedNotification(NotificationType):
    """A superuser erased a user together with their records (the override of item 83)."""
    event_type = 'user_erased'
    label = 'User erased'
    description = (
        'Sent to every active superuser when a superuser erases a user and their records. '
        'Always delivered in-app; it cannot be switched off in Settings.'
    )
    category = 'oversight'
    notification_type = 'warning'
    push_by_default = False
    user_configurable = False
    link = '/admin/users'

    def recipients(self, context):
        return get_user_model().objects.filter(is_superuser=True, is_active=True)

    def title(self, context):
        return 'A user was erased'

    def message(self, context):
        return (
            f"{context['actor_name']} erased the user {context['username']} "
            f"and {context['rows']} related records. Reason: {context['reason']}"
        )

    def dedupe_key(self, context, user):
        return f"user-erased:{context['user_id']}:user:{user.id}"
