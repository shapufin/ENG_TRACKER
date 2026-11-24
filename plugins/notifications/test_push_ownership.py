"""H4 (audit 2026-11-16): a push endpoint belongs to one person at a time."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from plugins.notifications.models import PushSubscription
from plugins.notifications.viewsets import NotificationViewSet

User = get_user_model()
ENDPOINT = "https://fcm.googleapis.com/fcm/send/shared-browser"


class PushOwnershipTests(TestCase):
    def setUp(self):
        # Deactivation reaches the subscriptions through the plugin's account signals, which a
        # suite booted on an empty database never connected; ready() is idempotent.
        from plugins.notifications.plugin import NotificationPlugin
        NotificationPlugin().ready()
        self.a = User.objects.create_user(username="a", email="a@t.test", password="x")
        self.b = User.objects.create_user(username="b", email="b@t.test", password="x")

    def _subscribe(self, user):
        request = APIRequestFactory().post(
            "/x/", {"endpoint": ENDPOINT, "keys": {"p256dh": "p", "auth": "a"}}, format="json"
        )
        force_authenticate(request, user=user)
        return NotificationViewSet.as_view({"post": "subscribe"})(request)

    def test_a_second_user_subscribing_with_the_same_endpoint_takes_it_over(self):
        self.assertEqual(self._subscribe(self.a).status_code, 201)
        self.assertEqual(self._subscribe(self.b).status_code, 201)
        self.assertFalse(PushSubscription.objects.get(user=self.a).is_active)
        self.assertTrue(PushSubscription.objects.get(user=self.b).is_active)

    def test_the_same_user_resubscribing_stays_active(self):
        self._subscribe(self.a)
        self._subscribe(self.a)
        self.assertEqual(PushSubscription.objects.filter(user=self.a, is_active=True).count(), 1)

    def test_deactivating_a_user_deactivates_their_subscriptions(self):
        self._subscribe(self.a)
        self.a.is_active = False
        self.a.save()
        self.assertFalse(PushSubscription.objects.get(user=self.a).is_active)

    def test_saving_an_active_user_keeps_subscriptions(self):
        self._subscribe(self.a)
        self.a.first_name = "Ann"
        self.a.save()
        self.assertTrue(PushSubscription.objects.get(user=self.a).is_active)
