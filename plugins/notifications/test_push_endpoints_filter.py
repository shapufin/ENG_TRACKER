"""send_push_notification(endpoints=...): phone approval pushes only to paired phones (item 90)."""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from plugins.notifications.models import PushSubscription
from plugins.notifications.push_service import send_push_notification

User = get_user_model()
PHONE = 'https://fcm.googleapis.com/fcm/send/phone'
LAPTOP = 'https://fcm.googleapis.com/fcm/send/laptop'


@patch('plugins.notifications.push_service.get_private_key', return_value='key')
@patch('plugins.notifications.push_service.webpush')
class EndpointFilterTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='ef-user', password='x')
        for endpoint in (PHONE, LAPTOP):
            PushSubscription.objects.create(user=self.user, endpoint=endpoint, p256dh_key='k', auth_key='a')

    def sent_endpoints(self, mock_webpush):
        return sorted(call.kwargs['subscription_info']['endpoint'] for call in mock_webpush.call_args_list)

    def test_endpoints_none_sends_to_every_active_subscription(self, mock_webpush, _key):
        self.assertEqual(send_push_notification(self.user, 't', 'm'), (2, 0))
        self.assertEqual(self.sent_endpoints(mock_webpush), sorted([PHONE, LAPTOP]))

    def test_endpoints_filter_sends_only_to_listed_endpoints(self, mock_webpush, _key):
        self.assertEqual(send_push_notification(self.user, 't', 'm', endpoints=[PHONE]), (1, 0))
        self.assertEqual(self.sent_endpoints(mock_webpush), [PHONE])

    def test_empty_endpoint_list_sends_nothing(self, mock_webpush, _key):
        self.assertEqual(send_push_notification(self.user, 't', 'm', endpoints=[]), (0, 0))
        mock_webpush.assert_not_called()

    def test_filtered_send_still_rejects_non_push_service_urls(self, mock_webpush, _key):
        evil = 'https://evil.example.com/push'
        PushSubscription.objects.create(user=self.user, endpoint=evil, p256dh_key='k', auth_key='a')
        self.assertEqual(send_push_notification(self.user, 't', 'm', endpoints=[evil]), (0, 1))
        mock_webpush.assert_not_called()
