"""H2 (audit 2026-11-16): a push endpoint is a URL the server POSTs to, so it must be a browser push service."""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from plugins.notifications.models import PushSubscription
from plugins.notifications.push_service import is_push_service_url, send_push_notification
from plugins.notifications.viewsets import NotificationViewSet

User = get_user_model()

GOOD = "https://fcm.googleapis.com/fcm/send/abc"


class IsPushServiceUrlTests(SimpleTestCase):
    def test_accepts_the_known_browser_push_services(self):
        for url in (
            GOOD,
            "https://updates.push.services.mozilla.com/wpush/v2/abc",
            "https://wns2-par02p.notify.windows.com/w/?token=abc",
            "https://web.push.apple.com/abc",
        ):
            with self.subTest(url=url):
                self.assertTrue(is_push_service_url(url))

    def test_rejects_everything_else(self):
        for url in (
            "http://fcm.googleapis.com/fcm/send/abc",  # not https
            "https://redis:6379/internal",
            "https://127.0.0.1/x",
            "https://fcm.googleapis.com.evil.com/x",  # suffix trick
            "https://evilfcm.googleapis.com/x",
            "https://fcm.googleapis.com@evil.com/x",  # userinfo trick
            "https://user:pw@fcm.googleapis.com/x",  # credentials
            "https://fcm.googleapis.com:8443/x",  # odd port
            "https://notify.windows.com.evil.com/x",
            "ftp://fcm.googleapis.com/x",
            "",
            "not a url",
            None,
            123,
        ):
            with self.subTest(url=url):
                self.assertFalse(is_push_service_url(url))

    @override_settings(PUSH_ENDPOINT_EXTRA_HOSTS=["push.example.test"])
    def test_extra_hosts_setting_extends_the_list(self):
        self.assertTrue(is_push_service_url("https://push.example.test/abc"))
        self.assertFalse(is_push_service_url("https://other.example.test/abc"))


class SubscribeValidationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="u", email="u@t.test", password="x")
        self.factory = APIRequestFactory()

    def _subscribe(self, data):
        request = self.factory.post("/x/", data, format="json")
        force_authenticate(request, user=self.user)
        return NotificationViewSet.as_view({"post": "subscribe"})(request)

    def _body(self, **over):
        body = {"endpoint": GOOD, "keys": {"p256dh": "p", "auth": "a"}}
        body.update(over)
        return body

    def test_internal_and_plain_http_endpoints_are_refused(self):
        for endpoint in ("http://redis:6379/internal", "https://redis:6379/internal", "http://fcm.googleapis.com/x"):
            with self.subTest(endpoint=endpoint):
                self.assertEqual(self._subscribe(self._body(endpoint=endpoint)).status_code, 400)
        self.assertEqual(PushSubscription.objects.count(), 0)

    def test_keys_that_are_not_an_object_are_400_not_500(self):
        for keys in ("x", ["a"], 5, None):
            with self.subTest(keys=keys):
                self.assertEqual(self._subscribe(self._body(keys=keys)).status_code, 400)

    def test_keys_must_be_strings(self):
        self.assertEqual(self._subscribe(self._body(keys={"p256dh": 1, "auth": "a"})).status_code, 400)

    def test_non_string_and_overlong_endpoint_is_400(self):
        self.assertEqual(self._subscribe(self._body(endpoint=["x"])).status_code, 400)
        long_url = "https://fcm.googleapis.com/" + "a" * 600
        self.assertEqual(self._subscribe(self._body(endpoint=long_url)).status_code, 400)

    def test_a_valid_subscription_still_works(self):
        self.assertEqual(self._subscribe(self._body()).status_code, 201)


class SendTimeGuardTests(TestCase):
    def test_a_stored_bad_row_is_skipped_and_deactivated(self):
        user = User.objects.create_user(username="s", email="s@t.test", password="x")
        bad = PushSubscription.objects.create(
            user=user, endpoint="http://redis:6379/internal", p256dh_key="k", auth_key="a"
        )
        good = PushSubscription.objects.create(user=user, endpoint=GOOD, p256dh_key="k", auth_key="a")
        with patch("plugins.notifications.push_service.get_private_key", return_value="pk"), patch(
            "plugins.notifications.push_service.webpush"
        ) as webpush:
            sent, failed = send_push_notification(user, "t", "m")
        self.assertEqual(webpush.call_count, 1)
        self.assertEqual(webpush.call_args.kwargs["subscription_info"]["endpoint"], GOOD)
        self.assertEqual((sent, failed), (1, 1))
        bad.refresh_from_db()
        good.refresh_from_db()
        self.assertFalse(bad.is_active)
        self.assertTrue(good.is_active)
