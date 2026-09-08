"""Tests for push notification subscription and signal triggers."""
import datetime
from unittest.mock import patch
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIRequestFactory, force_authenticate
from rest_framework.response import Response
from plugins.notifications.idempotency import idempotency_scope, IdempotencyReplay
from apps.overtime.models import OvertimeLog
from apps.standby.models import StandbyLog
from apps.leave_management.models import LeaveRequest
from apps.users.models import Team, TeamMembership
from plugins.notifications.models import Notification, NotificationPreference, PushSubscription
from plugins.notifications.viewsets import NotificationViewSet

User = get_user_model()


class NotificationPluginLifecycleTest(TestCase):
    def test_ready_registers_signal_handlers(self):
        from django.db.models.signals import post_save
        from plugins.notifications.plugin import NotificationPlugin

        NotificationPlugin().ready()
        sync_receivers, async_receivers = post_save._live_receivers(LeaveRequest)
        receivers = [*sync_receivers, *async_receivers]
        self.assertIn(
            'leave_request_notification',
            {receiver.__name__ for receiver in receivers},
        )

    def test_signal_receivers_have_stable_dispatch_uids(self):
        from django.db.models.signals import post_delete, post_save, pre_save

        expected = {
            'notifications.track_leave_request_state',
            'notifications.leave_request_notification',
            'notifications.leave_request_deleted',
            'notifications.track_overtime_state',
            'notifications.overtime_log_notification',
            'notifications.track_standby_state',
            'notifications.standby_log_notification',
            'notifications.approval_period_close_notification',
        }
        actual = {
            lookup_key[0]
            for signal in (pre_save, post_save, post_delete)
            for lookup_key, _receiver, _is_async in signal.receivers
            if isinstance(lookup_key, tuple)
            and isinstance(lookup_key[0], str)
            and lookup_key[0].startswith('notifications.')
        }
        self.assertEqual(actual, expected)

    def test_disable_disconnects_signal_handlers(self):
        from django.db.models.signals import post_save
        from plugins.notifications.plugin import NotificationPlugin

        plugin = NotificationPlugin()
        plugin.ready()
        plugin.disable()
        sync_receivers, async_receivers = post_save._live_receivers(LeaveRequest)
        receivers = [*sync_receivers, *async_receivers]
        self.assertNotIn(
            'leave_request_notification',
            {receiver.__name__ for receiver in receivers},
        )
        plugin.ready()


class IdempotencyScopeTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="idempotent", email="idempotent@test.com", password="testpass123"
        )
        self.factory = APIRequestFactory()

    def request(self, body, key="same-key", endpoint="overtime"):
        request = self.factory.post('/api/overtime/logs/', body, format='json')
        request.META['HTTP_IDEMPOTENCY_KEY'] = key
        request.user = self.user
        return request

    def test_completed_key_replays_response(self):
        request = self.request({'hours': 2})
        with idempotency_scope(request, 'overtime') as scope:
            scope.complete(Response({'id': 12}, status=201))

        with self.assertRaises(IdempotencyReplay) as captured:
            with idempotency_scope(self.request({'hours': 2}), 'overtime'):
                pass
        self.assertEqual(captured.exception.response.status_code, 201)
        self.assertEqual(captured.exception.response.data, {'id': 12})

    def test_same_key_with_different_body_is_rejected(self):
        request = self.request({'hours': 2})
        with idempotency_scope(request, 'overtime') as scope:
            scope.complete(Response({'id': 12}, status=201))

        with self.assertRaises(Exception):
            with idempotency_scope(self.request({'hours': 3}), 'overtime'):
                pass

    def test_malformed_keys_are_rejected(self):
        with self.assertRaises(Exception):
            with idempotency_scope(self.request({'hours': 2}, key="   "), 'overtime'):
                pass
        with self.assertRaises(Exception):
            with idempotency_scope(self.request({'hours': 2}, key="x" * 101), 'overtime'):
                pass

    def test_incomplete_scope_does_not_replay(self):
        request = self.request({'hours': 2}, key="rollback-key")
        with idempotency_scope(request, 'overtime'):
            pass
        with idempotency_scope(self.request({'hours': 2}, key="rollback-key"), 'overtime') as scope:
            self.assertIsNotNone(scope)

    def test_key_isolated_by_user_and_endpoint(self):
        request = self.request({'hours': 2})
        with idempotency_scope(request, 'overtime') as scope:
            scope.complete(Response({'id': 12}, status=201))

        other = User.objects.create_user(username="other", password="testpass123")
        other_request = self.factory.post('/api/overtime/logs/', {'hours': 2}, format='json')
        other_request.META['HTTP_IDEMPOTENCY_KEY'] = 'same-key'
        other_request.user = other
        with idempotency_scope(other_request, 'overtime') as scope:
            self.assertIsNotNone(scope)

        with idempotency_scope(self.request({'hours': 2}), 'standby') as scope:
            self.assertIsNotNone(scope)


class PushSubscriptionModelTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser", email="test@test.com", password="testpass123"
        )

    def test_create_subscription(self):
        sub = PushSubscription.objects.create(
            user=self.user,
            endpoint="https://fcm.googleapis.com/fcm/send/test123",
            p256dh_key="p256dh_key_value",
            auth_key="auth_key_value",
        )
        self.assertEqual(sub.user, self.user)
        self.assertTrue(sub.is_active)
        self.assertIsNotNone(sub.created_at)

    def test_unique_together_user_endpoint(self):
        PushSubscription.objects.create(
            user=self.user,
            endpoint="https://fcm.googleapis.com/fcm/send/test123",
            p256dh_key="key1",
            auth_key="auth1",
        )
        with self.assertRaises(Exception):
            PushSubscription.objects.create(
                user=self.user,
                endpoint="https://fcm.googleapis.com/fcm/send/test123",
                p256dh_key="key2",
                auth_key="auth2",
            )

    def test_multiple_users_same_endpoint(self):
        user2 = User.objects.create_user(
            username="user2", email="user2@test.com", password="testpass123"
        )
        PushSubscription.objects.create(
            user=self.user,
            endpoint="https://fcm.googleapis.com/fcm/send/test123",
            p256dh_key="key1",
            auth_key="auth1",
        )
        # Different user, same endpoint — should be fine (unique per user+endpoint)
        PushSubscription.objects.create(
            user=user2,
            endpoint="https://fcm.googleapis.com/fcm/send/test123",
            p256dh_key="key2",
            auth_key="auth2",
        )
        self.assertEqual(PushSubscription.objects.count(), 2)


class PushSubscriptionAPITest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser", email="test@test.com", password="testpass123"
        )
        self.factory = APIRequestFactory()
        self.viewset = NotificationViewSet.as_view({
            'subscribe': 'post',
            'unsubscribe': 'post',
            'subscriptions': 'get',
            'vapid_public_key': 'get',
        })

    def _request(self, method, action, data=None):
        url = f'/api/plugins/notifications/notifications/{action}/'
        if method == 'get':
            request = self.factory.get(url)
        elif method == 'patch':
            request = self.factory.patch(url, data or {}, format='json')
        else:
            request = self.factory.post(url, data or {}, format='json')
        force_authenticate(request, user=self.user)
        view = NotificationViewSet.as_view({method: action})
        return view(request)

    def test_subscribe_creates_subscription(self):
        response = self._request('post', 'subscribe', {
            "endpoint": "https://fcm.googleapis.com/fcm/send/test123",
            "keys": {"p256dh": "p256dh_value", "auth": "auth_value"}
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(PushSubscription.objects.count(), 1)
        sub = PushSubscription.objects.first()
        self.assertEqual(sub.endpoint, "https://fcm.googleapis.com/fcm/send/test123")
        self.assertEqual(sub.p256dh_key, "p256dh_value")
        self.assertTrue(sub.is_active)

    def test_subscribe_missing_fields_returns_400(self):
        response = self._request('post', 'subscribe', {
            "endpoint": "https://fcm.googleapis.com/fcm/send/test123",
        })
        self.assertEqual(response.status_code, 400)

    def test_subscribe_upsert_existing_endpoint(self):
        self._request('post', 'subscribe', {
            "endpoint": "https://fcm.googleapis.com/fcm/send/test123",
            "keys": {"p256dh": "old_key", "auth": "old_auth"}
        })
        response = self._request('post', 'subscribe', {
            "endpoint": "https://fcm.googleapis.com/fcm/send/test123",
            "keys": {"p256dh": "new_key", "auth": "new_auth"}
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(PushSubscription.objects.count(), 1)
        sub = PushSubscription.objects.first()
        self.assertEqual(sub.p256dh_key, "new_key")

    def test_unsubscribe_deactivates_subscription(self):
        PushSubscription.objects.create(
            user=self.user,
            endpoint="https://fcm.googleapis.com/fcm/send/test123",
            p256dh_key="key",
            auth_key="auth",
        )
        response = self._request('post', 'unsubscribe', {
            "endpoint": "https://fcm.googleapis.com/fcm/send/test123"
        })
        self.assertEqual(response.status_code, 200)
        sub = PushSubscription.objects.first()
        self.assertFalse(sub.is_active)

    def test_list_subscriptions(self):
        PushSubscription.objects.create(
            user=self.user,
            endpoint="https://fcm.googleapis.com/fcm/send/test1",
            p256dh_key="key1",
            auth_key="auth1",
        )
        PushSubscription.objects.create(
            user=self.user,
            endpoint="https://fcm.googleapis.com/fcm/send/test2",
            p256dh_key="key2",
            auth_key="auth2",
        )
        response = self._request('get', 'subscriptions')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)

    def test_vapid_public_key_endpoint(self):
        with patch('plugins.notifications.viewsets.get_public_key', return_value="test_public_key"):
            response = self._request('get', 'vapid_public_key')
            self.assertEqual(response.status_code, 200)
            self.assertIn('public_key', response.data)

    def test_preferences_default_to_all_own_events_enabled(self):
        response = self._request('get', 'preferences')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 8)
        self.assertTrue(all(item['in_app_enabled'] and item['push_enabled'] for item in response.data))

    def test_preference_update_disables_in_app_delivery(self):
        response = self._request('patch', 'preferences', {
            'event_type': 'own_leave_updated',
            'in_app_enabled': False,
        })
        self.assertEqual(response.status_code, 200)
        preference = NotificationPreference.objects.get(
            user=self.user, event_type='own_leave_updated'
        )
        self.assertFalse(preference.in_app_enabled)
        self.assertTrue(preference.push_enabled)

    def test_employee_cannot_update_team_preference(self):
        response = self._request('patch', 'preferences', {
            'event_type': 'team_action_required',
            'in_app_enabled': False,
        })
        self.assertEqual(response.status_code, 400)


class OvertimeSignalTest(TestCase):
    """Verify overtime log creation triggers notification + push."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser", email="test@test.com", password="testpass123"
        )

    @patch('plugins.notifications.signals.send_push_notification')
    def test_overtime_creation_notifies_led_team_leader(self, mock_push):
        from apps.overtime.models import Client
        team_leader = User.objects.create_user(
            username="teamleader", email="tl@test.com", password="testpass123"
        )
        team = Team.objects.create(name="Operations", code="OPS", team_leader=team_leader)
        TeamMembership.objects.create(user_profile=self.user.profile, team=team)
        client = Client.objects.create(name="Test Client")

        OvertimeLog.objects.create(
            user=self.user,
            client=client,
            date="2026-08-03",
            hours=2.0,
            start_time=datetime.time(18, 0),
            end_time=datetime.time(20, 0),
            description="Test overtime",
        )

        self.assertTrue(Notification.objects.filter(user=team_leader).exists())
        self.assertTrue(
            Notification.objects.filter(
                user=team_leader,
                title="Action Required: New Overtime Log",
            ).exists()
        )

    @patch('plugins.notifications.signals.send_push_notification')
    def test_overtime_creation_creates_notification(self, mock_push):
        """Overtime log creation should create an in-app notification."""
        from apps.overtime.models import Client
        client = Client.objects.create(name="Test Client")

        OvertimeLog.objects.create(
            user=self.user,
            client=client,
            date="2026-08-03",
            hours=2.0,
            start_time=datetime.time(18, 0),
            end_time=datetime.time(20, 0),
            description="Test overtime",
        )

        notifs = Notification.objects.filter(user=self.user)
        self.assertTrue(notifs.exists())
        self.assertIn("Overtime", notifs.first().title)
        # Push is called best-effort
        mock_push.assert_called()

    @patch('plugins.notifications.signals.send_push_notification')
    def test_overtime_status_change_creates_notification(self, mock_push):
        """Overtime status change (approve/reject) should create a notification."""
        from apps.overtime.models import Client
        client = Client.objects.create(name="Test Client")

        OvertimeLog.objects.create(
            user=self.user,
            client=client,
            date="2026-08-03",
            hours=2.0,
            start_time=datetime.time(18, 0),
            end_time=datetime.time(20, 0),
            description="Test overtime",
        )

        # Clear creation notifications
        Notification.objects.all().delete()

        overtime = OvertimeLog.objects.first()
        overtime.status = 'approved'
        overtime.save()

        notifs = Notification.objects.filter(user=self.user)
        self.assertTrue(notifs.exists())
        self.assertIn("Updated", notifs.first().title)


class StandbySignalTest(TestCase):
    """Verify standby log creation triggers notification."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser", email="test@test.com", password="testpass123"
        )

    @patch('plugins.notifications.signals.send_push_notification')
    def test_standby_creation_creates_notification(self, mock_push):
        StandbyLog.objects.create(
            user=self.user,
            date="2026-08-03",
            start_time=datetime.time(18, 0),
            end_time=datetime.time(20, 0),
            description="Test standby",
        )

        notifs = Notification.objects.filter(user=self.user)
        self.assertTrue(notifs.exists())
        self.assertIn("Standby", notifs.first().title)


class LeaveSignalPushTest(TestCase):
    """Verify leave request triggers push (existing signal, now with push)."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser", email="test@test.com", password="testpass123"
        )

    @patch('plugins.notifications.signals.send_push_notification')
    def test_leave_creation_triggers_push(self, mock_push):
        LeaveRequest.objects.create(
            user=self.user,
            request_type='vacation',
            start_date='2026-08-10',
            end_date='2026-08-12',
            reason='Test vacation',
        )

        # Push should have been called for the user
        mock_push.assert_called()
        call_args = mock_push.call_args
        self.assertEqual(call_args[0][0], self.user)  # first positional arg = user

    @patch('plugins.notifications.signals.send_push_notification')
    def test_preference_disables_both_delivery_channels(self, mock_push):
        NotificationPreference.objects.create(
            user=self.user,
            event_type='own_leave_submitted',
            in_app_enabled=False,
            push_enabled=False,
        )
        LeaveRequest.objects.create(
            user=self.user,
            request_type='vacation',
            start_date='2026-08-10',
            end_date='2026-08-12',
            reason='Quiet vacation',
        )
        self.assertFalse(Notification.objects.filter(user=self.user).exists())
        mock_push.assert_not_called()
