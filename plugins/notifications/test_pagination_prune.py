"""PERF-06 (D5): the notification list is paginated and read notifications are pruned."""
from datetime import timedelta
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from plugins.notifications.models import Notification

User = get_user_model()
URL = '/api/plugins/notifications/notifications/'


def _make(user, n, **extra):
    Notification.objects.bulk_create(
        [Notification(user=user, title=f't{i}', message='m', **extra) for i in range(n)]
    )


class NotificationPaginationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='np-user', password='x')
        self.api = APIClient()
        self.api.force_authenticate(self.user)

    def _get(self, params=''):
        # The plugin URLs are only mounted when the plugin is enabled at process
        # start, so call the viewset directly like the neighbouring tests do.
        from rest_framework.test import APIRequestFactory, force_authenticate
        from plugins.notifications.viewsets import NotificationViewSet

        request = APIRequestFactory().get(f'{URL}{params}')
        force_authenticate(request, user=self.user)
        response = NotificationViewSet.as_view({'get': 'list'})(request)
        response.render()
        return response

    def test_list_is_paginated_with_a_default_page(self):
        _make(self.user, 130)
        resp = self._get()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], 130)
        self.assertEqual(len(resp.data['results']), 100)
        self.assertIsNotNone(resp.data['next'])

    def test_second_page_is_reachable_and_has_the_remainder(self):
        _make(self.user, 130)
        first = self._get()
        second = self._get('?page=2')
        self.assertEqual(second.status_code, 200)
        self.assertEqual(len(second.data['results']), 30)
        self.assertIsNone(second.data['next'])
        ids = {r['id'] for r in first.data['results']} | {r['id'] for r in second.data['results']}
        self.assertEqual(len(ids), 130)

    def test_page_size_is_client_overridable_but_clamped(self):
        _make(self.user, 250)
        self.assertEqual(len(self._get('?page_size=10').data['results']), 10)
        self.assertEqual(len(self._get('?page_size=5000').data['results']), 200)

    def test_newest_first_and_only_own_rows(self):
        other = User.objects.create_user(username='np-other', password='x')
        _make(other, 3)
        _make(self.user, 2)
        resp = self._get()
        self.assertEqual(resp.data['count'], 2)
        stamps = [r['created_at'] for r in resp.data['results']]
        self.assertEqual(stamps, sorted(stamps, reverse=True))

    def test_unread_count_ignores_the_page_limit(self):
        from rest_framework.test import APIRequestFactory, force_authenticate
        from plugins.notifications.viewsets import NotificationViewSet

        _make(self.user, 130)
        request = APIRequestFactory().get(f'{URL}unread_count/')
        force_authenticate(request, user=self.user)
        resp = NotificationViewSet.as_view({'get': 'unread_count'})(request)
        self.assertEqual(resp.data['count'], 130)


class PruneNotificationsTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='pn-user', password='x')
        now = timezone.now()
        self.old_read = self._row(now - timedelta(days=200), is_read=True)
        self.old_unread = self._row(now - timedelta(days=400), is_read=False)
        self.new_read = self._row(now - timedelta(days=10), is_read=True)
        self.edge_read = self._row(now - timedelta(days=179), is_read=True)

    def _row(self, created, **kwargs):
        row = Notification.objects.create(user=self.user, title='t', message='m', **kwargs)
        Notification.objects.filter(pk=row.pk).update(created_at=created)
        return row.pk

    def test_default_prunes_read_notifications_older_than_180_days_only(self):
        out = StringIO()
        call_command('prune_notifications', stdout=out)
        remaining = set(Notification.objects.values_list('pk', flat=True))
        self.assertEqual(remaining, {self.old_unread, self.new_read, self.edge_read})
        self.assertIn('1', out.getvalue())

    def test_days_option_moves_the_cutoff(self):
        call_command('prune_notifications', '--days', '5', stdout=StringIO())
        remaining = set(Notification.objects.values_list('pk', flat=True))
        self.assertEqual(remaining, {self.old_unread})

    def test_batch_size_bounds_each_delete(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        old = timezone.now() - timedelta(days=300)
        for _ in range(11):
            self._row(old, is_read=True)
        with CaptureQueriesContext(connection) as ctx:
            call_command('prune_notifications', '--batch-size', '5', stdout=StringIO())
        deletes = [q for q in ctx.captured_queries if q['sql'].startswith('DELETE FROM "notifications_notification"')]
        # 12 old read rows (11 + setUp's one) -> ceil(12/5) = 3 bounded deletes
        self.assertEqual(len(deletes), 3)
        remaining = set(Notification.objects.values_list('pk', flat=True))
        self.assertEqual(remaining, {self.old_unread, self.new_read, self.edge_read})

    def test_rejects_non_positive_batch_size(self):
        from django.core.management.base import CommandError

        with self.assertRaises(CommandError):
            call_command('prune_notifications', '--batch-size', '0', stdout=StringIO())

    def test_rejects_non_positive_days(self):
        from django.core.management.base import CommandError

        with self.assertRaises(CommandError):
            call_command('prune_notifications', '--days', '0', stdout=StringIO())
