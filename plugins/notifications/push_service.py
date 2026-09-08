"""Web Push sending service.

Sends push notifications to subscribed browsers via pywebpush.
Called when a Notification is created — pushes to all active
PushSubscription records for that user.
"""

import logging
from pywebpush import webpush, WebPushException
from .models import PushSubscription
from .vapid_utils import get_private_key, VAPID_SUBJECT

logger = logging.getLogger(__name__)

# Payload is kept small — browsers limit push payload to ~4KB
PUSH_PAYLOAD_TEMPLATE = {
    "title": "",
    "body": "",
    "url": "",
    "tag": "engtracker-notification",
}


def send_push_notification(user, title, message, url=None):
    """Send a push notification to all active subscriptions for a user.

    Args:
        user: Django User instance
        title: Notification title
        message: Notification body text
        url: Optional URL to open when clicked

    Returns:
        (sent_count, failed_count) tuple
    """
    subscriptions = PushSubscription.objects.filter(user=user, is_active=True)
    if not subscriptions.exists():
        return 0, 0

    payload = PUSH_PAYLOAD_TEMPLATE.copy()
    payload["title"] = title
    payload["body"] = message
    if url:
        payload["url"] = url

    import json
    payload_json = json.dumps(payload)

    sent = 0
    failed = 0

    for sub in subscriptions:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {
                        "p256dh": sub.p256dh_key,
                        "auth": sub.auth_key,
                    },
                },
                data=payload_json,
                vapid_private_key=get_private_key(),
                vapid_claims={"sub": VAPID_SUBJECT},
            )
            sent += 1
        except WebPushException as e:
            logger.warning("Push failed for user_id=%s: %s", user.id, e)
            # 404/410 = subscription expired, deactivate it
            if hasattr(e, 'response') and e.response is not None:
                if e.response.status_code in (404, 410):
                    sub.is_active = False
                    sub.save(update_fields=['is_active'])
            failed += 1
        except Exception as e:
            logger.error("Unexpected push error for user_id=%s: %s", user.id, e)
            failed += 1

    return sent, failed
