"""Web Push sending service.

Sends push notifications to subscribed browsers via pywebpush.
Called when a Notification is created — pushes to all active
PushSubscription records for that user.
"""

import logging
from urllib.parse import urlparse

import requests
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from pywebpush import webpush, WebPushException
from .models import PushSubscription
from .vapid_utils import get_private_key, get_vapid_subject

logger = logging.getLogger(__name__)

# pywebpush 2.5.0 ``webpush(..., timeout=)`` is forwarded to ``requests.post``;
# left unset the request has no bound at all, so one dead push endpoint would
# hold a gunicorn worker. 5 s per subscription keeps the worst case bounded.
PUSH_TIMEOUT_SECONDS = 5
# Consecutive transient failures before a subscription is deactivated (audit
# 2026-11-16 M7): a dead endpoint otherwise costs PUSH_TIMEOUT_SECONDS on every notice.
PUSH_MAX_FAILURES = 5
# RFC 8030 §5.2: pywebpush defaults ``ttl`` to 0, which tells the gateway to
# deliver only over a connection that exists right now. 5 minutes lets the push
# service queue a normal alert for a phone that is asleep.
DEFAULT_PUSH_TTL_SECONDS = 300

# Hosts a browser may hand out as a push endpoint (audit 2026-11-16 H2). The
# server POSTs to whatever is stored, so anything else is a request primitive.
# Exact hosts match only themselves; suffixes match any subdomain.
PUSH_SERVICE_HOSTS = frozenset({
    "fcm.googleapis.com",          # Chrome, Edge, Opera, Brave (FCM)
    "android.googleapis.com",      # legacy Chrome GCM endpoints
    "updates.push.services.mozilla.com",  # Firefox
    "web.push.apple.com",          # Safari
})
PUSH_SERVICE_SUFFIXES = (
    ".push.services.mozilla.com",
    ".notify.windows.com",         # Windows Notification Service (Edge)
    ".push.apple.com",
)
PUSH_ENDPOINT_MAX_LENGTH = 500


def is_push_service_url(url) -> bool:
    """True only for an https URL on a known browser push service.

    Exact parse, never ``startswith``: ``fcm.googleapis.com.evil.com`` and
    ``fcm.googleapis.com@evil.com`` must fail. Extra hosts come from
    ``settings.PUSH_ENDPOINT_EXTRA_HOSTS``. Fails closed on anything malformed.
    """
    if not isinstance(url, str) or not url or len(url) > PUSH_ENDPOINT_MAX_LENGTH:
        return False
    try:
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        port = parsed.port
    except ValueError:
        return False
    if parsed.scheme != "https" or not host or parsed.username or parsed.password:
        return False
    if port not in (None, 443):
        return False
    extra = {h.lower() for h in getattr(settings, "PUSH_ENDPOINT_EXTRA_HOSTS", ())}
    return host in PUSH_SERVICE_HOSTS or host in extra or host.endswith(PUSH_SERVICE_SUFFIXES)


# Payload is kept small — browsers limit push payload to ~4KB
PUSH_PAYLOAD_TEMPLATE = {
    "title": "",
    "body": "",
    "url": "",
    "tag": "engtracker-notification",
}


def _count_failure(sub):
    sub.failure_count += 1
    if sub.failure_count >= PUSH_MAX_FAILURES:
        sub.is_active = False
        logger.warning("Push subscription %s deactivated after %s failures", sub.pk, sub.failure_count)
    sub.save(update_fields=['failure_count', 'is_active'])


def send_push_notification(
    user,
    title,
    message,
    url=None,
    endpoints=None,
    ttl=DEFAULT_PUSH_TTL_SECONDS,
    urgency="high",
):
    """Send a push notification to all active subscriptions for a user.

    Args:
        user: Django User instance
        title: Notification title
        message: Notification body text
        url: Optional URL to open when clicked
        endpoints: Optional list; when given, only subscriptions with one of these
            endpoints are used (phone approval targets paired phones, item 90)
        ttl: RFC 8030 Time-To-Live in seconds; how long the push service may queue it
        urgency: RFC 8030 urgency (``high`` wakes a sleeping phone; ``normal``/``low``
            are batched by Android Doze and iOS power management)

    Returns:
        (sent_count, failed_count) tuple
    """
    subscriptions = PushSubscription.objects.filter(user=user, is_active=True)
    if endpoints is not None:
        subscriptions = subscriptions.filter(endpoint__in=list(endpoints))
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
        if not is_push_service_url(sub.endpoint):
            logger.warning("Push skipped for user_id=%s: stored endpoint is not a push service", user.id)
            sub.is_active = False
            sub.save(update_fields=['is_active'])
            failed += 1
            continue
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
                vapid_claims={"sub": get_vapid_subject()},
                timeout=PUSH_TIMEOUT_SECONDS,
                ttl=ttl,
                headers={"Urgency": urgency},
            )
            sent += 1
            if sub.failure_count:
                sub.failure_count = 0
                sub.save(update_fields=['failure_count'])
        except WebPushException as e:
            logger.warning("Push failed for user_id=%s: %s", user.id, e)
            # 404/410 = subscription expired, deactivate it
            if hasattr(e, 'response') and e.response is not None:
                if e.response.status_code in (404, 410):
                    sub.is_active = False
                    sub.save(update_fields=['is_active'])
                    failed += 1
                    continue
            _count_failure(sub)
            failed += 1
        except requests.exceptions.RequestException as e:
            # Timeout / connection errors: transient, so the request is never
            # failed by it, but a run of them deactivates the dead endpoint.
            logger.warning("Push request error for user_id=%s: %s", user.id, e)
            _count_failure(sub)
            failed += 1

    return sent, failed
