"""Admin notification-type kill-switch: catalogue, group toggle, delivery, cache."""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role
from plugins.notifications.models import (
    Notification,
    NotificationEventTypeConfig,
)
from plugins.notifications.signals import _create_notification
from plugins.notifications.types.base import REGISTRY, NotificationType
from plugins.notifications.viewsets import (
    NotificationEventTypeConfigViewSet,
    NotificationViewSet,
)

User = get_user_model()

GROUP = 'fixture_group'
ALWAYS_ON = 'fixture_always_on'


def _members(group):
    return sorted(cls.event_type for cls in REGISTRY.values() if cls.preference_key == group)


class EventTypeConfigApiTests(TestCase):
    def setUp(self):
        cache.clear()
        # Fixture types live only inside this test: importing real plugin types
        # at module level would leak into REGISTRY for every later test module.
        self.enterContext(patch.dict(REGISTRY))

        class GroupMemberA(NotificationType):
            event_type = 'fixture_group_a'
            label = 'Group member A'
            description = 'First member.'
            category = 'oversight'
            preference_group = GROUP
            preference_group_label = 'Fixture group'

        class GroupMemberB(NotificationType):
            event_type = 'fixture_group_b'
            label = 'Group member B'
            description = 'Second member.'
            category = 'oversight'
            preference_group = GROUP
            preference_group_label = 'Fixture group'

        class AlwaysOn(NotificationType):
            event_type = ALWAYS_ON
            label = 'Always on'
            description = 'Always delivered.'
            category = 'own'
            user_configurable = False

        self.factory = APIRequestFactory()
        Role.objects.get_or_create(code='hbpr', defaults={'name': 'hbpr'})
        self.admin = User.objects.create_user(
            username='admin_n', email='admin_n@test.com', password='testpass123',
            is_staff=True, is_superuser=True,
        )
        self.employee = User.objects.create_user(
            username='emp_n', email='emp_n@test.com', password='testpass123',
        )
        self.hbpr = User.objects.create_user(
            username='hbpr_n', email='hbpr_n@test.com', password='testpass123',
        )
        assign_role(self.hbpr, 'hbpr')

    def _admin_request(self, method, data=None, pk=None, user=None):
        url = '/api/plugins/notifications/event-type-config/'
        if pk is not None:
            url += f'{pk}/'
        if method == 'get':
            request = self.factory.get(url)
            view = NotificationEventTypeConfigViewSet.as_view({'get': 'list'})
        else:
            request = self.factory.patch(url, data or {}, format='json')
            view = NotificationEventTypeConfigViewSet.as_view({'patch': 'partial_update'})
        force_authenticate(request, user=user or self.admin)
        if pk is not None:
            return view(request, pk=pk)
        return view(request)

    def _rows(self):
        response = self._admin_request('get')
        self.assertEqual(response.status_code, 200)
        return {row['key']: row for row in response.data}

    def test_non_staff_cannot_list(self):
        self.assertEqual(self._admin_request('get', user=self.employee).status_code, 403)

    def test_staff_lists_catalogue_with_group_rows(self):
        rows = self._rows()
        self.assertIn('own_leave_submitted', rows)
        self.assertIn(GROUP, rows)
        self.assertEqual(rows[GROUP]['label'], 'Fixture group')
        self.assertGreater(len(rows[GROUP]['event_types']), 1)
        self.assertEqual(rows[GROUP]['event_types'], _members(GROUP))
        self.assertFalse(rows[ALWAYS_ON]['user_configurable'])
        self.assertEqual(rows[ALWAYS_ON]['audience'], 'own')
        self.assertEqual(rows[GROUP]['audience'], 'oversight')

    def test_group_toggle_writes_every_member_and_hides_from_preferences(self):
        response = self._admin_request('patch', {'enabled': False}, pk=GROUP)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['enabled'])
        for event_type in _members(GROUP):
            self.assertFalse(
                NotificationEventTypeConfig.objects.get(event_type=event_type).is_enabled
            )

        prefs = self.factory.get('/api/plugins/notifications/notifications/preferences/')
        force_authenticate(prefs, user=self.hbpr)
        prefs_response = NotificationViewSet.as_view({'get': 'preferences'})(prefs)
        self.assertNotIn(GROUP, [item['event_type'] for item in prefs_response.data])

        member = _members(GROUP)[0]
        _create_notification(
            user=self.hbpr, title='t', message='m', event_type=member,
            preference_key=GROUP,
        )
        self.assertFalse(Notification.objects.filter(user=self.hbpr).exists())

    def test_group_toggle_back_on_restores_delivery(self):
        self._admin_request('patch', {'enabled': False}, pk=GROUP)
        response = self._admin_request('patch', {'enabled': True}, pk=GROUP)
        self.assertTrue(response.data['enabled'])
        member = _members(GROUP)[0]
        _create_notification(
            user=self.hbpr, title='t', message='m', event_type=member,
            preference_key=GROUP,
        )
        self.assertTrue(Notification.objects.filter(user=self.hbpr).exists())

    def test_disabling_always_on_type_suppresses_creation(self):
        _create_notification(
            user=self.employee, title='t', message='m', event_type=ALWAYS_ON,
        )
        self.assertEqual(Notification.objects.filter(user=self.employee).count(), 1)
        self._admin_request('patch', {'enabled': False}, pk=ALWAYS_ON)
        _create_notification(
            user=self.employee, title='t2', message='m2', event_type=ALWAYS_ON,
        )
        self.assertEqual(Notification.objects.filter(user=self.employee).count(), 1)

    @patch('plugins.notifications.signals.send_push_notification')
    def test_disabled_type_sends_no_push(self, send_push):
        # Push is deferred to commit (PERF-08); run the commit callbacks.
        with self.captureOnCommitCallbacks(execute=True):
            _create_notification(
                user=self.employee, title='t', message='m', event_type=ALWAYS_ON,
            )
        # Precondition: while enabled, the push path is attempted for this user.
        self.assertEqual(send_push.call_count, 1)

        self._admin_request('patch', {'enabled': False}, pk=ALWAYS_ON)
        send_push.reset_mock()
        with self.captureOnCommitCallbacks(execute=True):
            _create_notification(
                user=self.employee, title='t2', message='m2', event_type=ALWAYS_ON,
            )
        send_push.assert_not_called()
        self.assertFalse(Notification.objects.filter(user=self.employee, title='t2').exists())

    def test_unknown_key_is_404_and_non_staff_patch_is_403(self):
        self.assertEqual(
            self._admin_request('patch', {'enabled': False}, pk='no_such_type').status_code,
            404,
        )
        self.assertEqual(
            self._admin_request('patch', {'enabled': False}, pk=GROUP, user=self.employee).status_code,
            403,
        )

    def test_enabled_must_be_boolean(self):
        response = self._admin_request('patch', {'enabled': 'yes'}, pk=GROUP)
        self.assertEqual(response.status_code, 400)

    def test_admin_model_save_is_reflected_immediately(self):
        self.assertTrue(NotificationEventTypeConfig.is_type_enabled('own_leave_updated'))
        NotificationEventTypeConfig.objects.update_or_create(
            event_type='own_leave_updated', defaults={'is_enabled': False},
        )
        self.assertFalse(NotificationEventTypeConfig.is_type_enabled('own_leave_updated'))
        NotificationEventTypeConfig.objects.update_or_create(
            event_type='own_leave_updated', defaults={'is_enabled': True},
        )
        self.assertTrue(NotificationEventTypeConfig.is_type_enabled('own_leave_updated'))

    def test_each_type_check_is_a_single_query(self):
        # Delivery checks one type at a time; the lookup must stay one query each.
        with CaptureQueriesContext(connection) as ctx:
            NotificationEventTypeConfig.is_type_enabled('own_leave_updated')
        self.assertEqual(len(ctx.captured_queries), 1)

    def test_preferences_read_queries_config_table_once(self):
        prefs = self.factory.get('/api/plugins/notifications/notifications/preferences/')
        force_authenticate(prefs, user=self.hbpr)
        with CaptureQueriesContext(connection) as ctx:
            response = NotificationViewSet.as_view({'get': 'preferences'})(prefs)
        self.assertEqual(response.status_code, 200)
        config_queries = [q for q in ctx.captured_queries if 'notificationeventtypeconfig' in q['sql']]
        self.assertEqual(len(config_queries), 1)
