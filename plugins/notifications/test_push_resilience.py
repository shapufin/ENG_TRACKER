"""PERF-08: web push is deferred to commit, bounded by a timeout, and never fails a request."""
from datetime import date
from unittest.mock import patch

import requests
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.overtime.models import Client, OvertimeLog
from plugins.notifications.models import Notification, PushSubscription
from plugins.notifications.push_service import PUSH_TIMEOUT_SECONDS, send_push_notification

User = get_user_model()


class PushDeferredToCommitTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='pd-user', password='x')
        self.client_obj = Client.objects.create(name='PD Client', code='PDC')

    def _create_ot(self):
        return OvertimeLog.objects.create(
            user=self.user, client=self.client_obj, date=date(2026, 8, 3), hours=2, description='x',
        )

    @patch('plugins.notifications.signals.send_push_notification')
    def test_push_runs_after_commit_not_during_the_transaction(self, mock_push):
        with self.captureOnCommitCallbacks(execute=False) as callbacks:
            self._create_ot()
        self.assertTrue(Notification.objects.filter(user=self.user).exists())  # in-app row is immediate
        mock_push.assert_not_called()
        for callback in callbacks:
            callback()
        mock_push.assert_called()


class PushTimeoutTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='pt-user', password='x')
        PushSubscription.objects.create(
            user=self.user, endpoint='https://push.example.test/abc', p256dh_key='k', auth_key='a',
        )

    @patch('plugins.notifications.push_service.get_private_key', return_value='key')
    @patch('plugins.notifications.push_service.webpush')
    def test_every_send_carries_a_bounded_timeout(self, mock_webpush, _key):
        send_push_notification(self.user, 't', 'm')
        self.assertEqual(mock_webpush.call_args.kwargs['timeout'], PUSH_TIMEOUT_SECONDS)
        self.assertLessEqual(PUSH_TIMEOUT_SECONDS, 10)

    @patch('plugins.notifications.push_service.get_private_key', return_value='key')
    @patch('plugins.notifications.push_service.webpush', side_effect=requests.exceptions.Timeout('slow'))
    def test_a_timeout_is_counted_as_failed_and_not_raised(self, _webpush, _key):
        self.assertEqual(send_push_notification(self.user, 't', 'm'), (0, 1))
        self.assertTrue(PushSubscription.objects.get(user=self.user).is_active)

    @patch('plugins.notifications.push_service.get_private_key', return_value='key')
    @patch('plugins.notifications.push_service.webpush', side_effect=requests.exceptions.ConnectionError('down'))
    def test_approval_still_succeeds_when_the_push_service_times_out(self, _webpush, _key):
        employee = User.objects.create_user(username='pt-emp', password='x')
        PushSubscription.objects.create(
            user=employee, endpoint='https://push.example.test/emp', p256dh_key='k', auth_key='a',
        )
        staff = User.objects.create_user(username='pt-staff', password='x', is_staff=True)
        client_obj = Client.objects.create(name='PT Client', code='PTC')
        with self.captureOnCommitCallbacks(execute=True):
            log = OvertimeLog.objects.create(
                user=employee, client=client_obj, date=date(2026, 8, 3), hours=2, description='x',
            )
        Notification.objects.filter(user=employee).delete()

        api = APIClient()
        api.force_authenticate(staff)
        with self.captureOnCommitCallbacks(execute=True):
            resp = api.post(f'/api/overtime/logs/{log.id}/approve/', {}, format='json')
        self.assertEqual(resp.status_code, 200, getattr(resp, 'data', None))
        self.assertTrue(Notification.objects.filter(user=employee).exists())


class PushMisconfiguredTests(TestCase):
    def test_missing_vapid_keys_count_as_failed_and_do_not_raise(self):
        from django.core.exceptions import ImproperlyConfigured

        user = User.objects.create_user(username='pm-user', password='x')
        for n in range(2):
            PushSubscription.objects.create(
                user=user, endpoint=f'https://push.example.test/{n}', p256dh_key='k', auth_key='a',
            )
        with patch('plugins.notifications.push_service.get_private_key', side_effect=ImproperlyConfigured('no keys')), \
                patch('plugins.notifications.push_service.webpush') as mock_webpush:
            self.assertEqual(send_push_notification(user, 't', 'm'), (0, 2))
        mock_webpush.assert_not_called()
        self.assertEqual(PushSubscription.objects.filter(user=user, is_active=True).count(), 2)
