"""Web Push sending service.

Sends push notifications to subscribed browsers via pywebpush.
Called when a Notification is created — pushes to all active
PushSubscription records for that user.
"""

import logging

import requests
from django.core.exceptions import ImproperlyConfigured
from pywebpush import webpush, WebPushException
from .models import PushSubscription
from .vapid_utils import get_private_key, VAPID_SUBJECT

logger = logging.getLogger(__name__)

# pywebpush 2.5.0 ``webpush(..., timeout=)`` is forwarded to ``requests.post``;
# left unset the request has no bound at all, so one dead push endpoint would
# hold a gunicorn worker. 5 s per subscription keeps the worst case bounded.
PUSH_TIMEOUT_SECONDS = 5

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

    try:
        private_key = get_private_key()
    except ImproperlyConfigured:
        # VAPID_REQUIRE_ENV and no keys: push is simply unavailable, not an error
        # worth a traceback per notification or a failed caller.
        logger.warning("Web Push skipped for user_id=%s: VAPID keys are not configured", user.id)
        return 0, subscriptions.count()

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
                vapid_private_key=private_key,
                vapid_claims={"sub": VAPID_SUBJECT},
                timeout=PUSH_TIMEOUT_SECONDS,
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
        except requests.exceptions.RequestException as e:
            # Timeout / connection errors from the push service: transient, the
            # subscription stays active and the request is never failed by it.
            logger.warning("Push request error for user_id=%s: %s", user.id, e)
            failed += 1

    return sent, failed
