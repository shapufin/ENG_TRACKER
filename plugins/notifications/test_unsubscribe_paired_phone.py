"""Logging out must not kill the push address a paired phone uses to approve sign-ins (item 90)."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.users.models import PairedPhone, WebAuthnCredential
from plugins.notifications.models import PushSubscription
from plugins.notifications.viewsets import NotificationViewSet

User = get_user_model()
PAIRED = "https://fcm.googleapis.com/fcm/send/paired"
OTHER = "https://fcm.googleapis.com/fcm/send/other"


class UnsubscribeKeepsPairedPhoneTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("phone_owner", password="x" * 12)
        credential = WebAuthnCredential.objects.create(
            user=self.user, credential_id=b"c", public_key=b"k", sign_count=0, name="Phone",
        )
        PairedPhone.objects.create(user=self.user, credential=credential, name="Phone", push_endpoint=PAIRED)
        for endpoint in (PAIRED, OTHER):
            PushSubscription.objects.create(user=self.user, endpoint=endpoint, p256dh_key="k", auth_key="a")

    def unsubscribe(self, endpoint):
        request = APIRequestFactory().post("/x/", {"endpoint": endpoint}, format="json")
        force_authenticate(request, user=self.user)
        return NotificationViewSet.as_view({"post": "unsubscribe"})(request)

    def test_a_paired_phone_endpoint_stays_active_and_is_reported_kept(self):
        response = self.unsubscribe(PAIRED)
        self.assertEqual((response.data["deactivated"], response.data["kept"]), (0, True))
        self.assertTrue(PushSubscription.objects.get(endpoint=PAIRED).is_active)

    def test_any_other_endpoint_is_still_deactivated(self):
        response = self.unsubscribe(OTHER)
        self.assertEqual((response.data["deactivated"], response.data["kept"]), (1, False))
        self.assertFalse(PushSubscription.objects.get(endpoint=OTHER).is_active)
