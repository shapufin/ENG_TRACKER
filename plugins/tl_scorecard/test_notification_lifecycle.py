"""Scorecard notification types follow the tl_scorecard plugin lifecycle, and the
notifications plugin's own kill-state gates every emission."""
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase

from apps.permissions.services.role_service import assign_role
from apps.plugins.models import Plugin
from plugins.notifications.models import Notification
from plugins.notifications.signals import _create_notification
from plugins.notifications.types.base import REGISTRY
from plugins.notifications.viewsets import _event_type_catalogue

from . import notification_types, signals

User = get_user_model()
SCORECARD_EVENT_TYPES = {cls.event_type for cls in notification_types.ALL_TYPES}


def _catalogue_event_types():
    return {event for row in _event_type_catalogue() for event in row['event_types']}


class ScorecardRegistryLifecycleTests(TestCase):
    def setUp(self):
        cache.clear()
        signals.connect()

    def tearDown(self):
        signals.connect()

    def test_all_scorecard_types_are_registered_when_connected(self):
        self.assertEqual(len(SCORECARD_EVENT_TYPES), 16)
        self.assertTrue(SCORECARD_EVENT_TYPES <= set(REGISTRY))

    def test_disconnect_removes_scorecard_types_from_registry_and_catalogue(self):
        signals.disconnect()
        self.assertFalse(SCORECARD_EVENT_TYPES & set(REGISTRY))
        self.assertFalse(SCORECARD_EVENT_TYPES & _catalogue_event_types())

    def test_reconnect_after_disconnect_restores_types(self):
        signals.disconnect()
        signals.connect()
        self.assertTrue(SCORECARD_EVENT_TYPES <= set(REGISTRY))
        self.assertTrue(SCORECARD_EVENT_TYPES <= _catalogue_event_types())


class NotificationsPluginGateTests(TestCase):
    def setUp(self):
        cache.clear()
        self.hbpr = User.objects.create_user(username='gate_hbpr', email='gate_hbpr@test.com', password='x')
        assign_role(self.hbpr, 'hbpr')

    def _plugin(self, is_enabled):
        return Plugin.objects.create(
            name='notifications', verbose_name='Notifications', version='1.0.0', is_enabled=is_enabled,
        )

    def test_disabled_notifications_plugin_suppresses_emission(self):
        self._plugin(is_enabled=False)
        result = _create_notification(
            self.hbpr, title='t', message='m', event_type='own_leave_submitted',
        )
        self.assertIsNone(result)
        self.assertFalse(Notification.objects.filter(user=self.hbpr).exists())

    def test_disabled_notifications_plugin_suppresses_scorecard_dispatch(self):
        self._plugin(is_enabled=False)
        _create_notification(
            self.hbpr, title='t', message='m', event_type='scorecard_flag_raised',
            preference_key='hbpr_team_risks',
        )
        self.assertFalse(Notification.objects.filter(user=self.hbpr).exists())

    def test_enabled_notifications_plugin_emits(self):
        self._plugin(is_enabled=True)
        _create_notification(
            self.hbpr, title='t', message='m', event_type='own_leave_submitted',
        )
        self.assertTrue(Notification.objects.filter(user=self.hbpr).exists())

    def test_missing_plugin_row_still_emits(self):
        _create_notification(
            self.hbpr, title='t', message='m', event_type='own_leave_submitted',
        )
        self.assertTrue(Notification.objects.filter(user=self.hbpr).exists())
