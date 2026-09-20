"""Tests for NotificationViewSet.preferences query efficiency."""
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIRequestFactory, force_authenticate

from plugins.notifications.models import NotificationEventTypeConfig, NotificationPreference
from plugins.notifications.viewsets import NotificationViewSet

User = get_user_model()


class NotificationPreferencesQueryTest(TestCase):
    """`get_globally_enabled` reads from a preloaded dict instead of
    issuing one `NotificationEventTypeConfig` query per preference row."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser", email="test@test.com", password="testpass123"
        )
        self.factory = APIRequestFactory()
        # A config row per registered event type, so the serializer has
        # several rows to serialize and an N+1 would show up clearly.
        NotificationEventTypeConfig.objects.all().delete()
        for event_type, _label in NotificationPreference.EVENT_TYPES:
            NotificationEventTypeConfig.objects.create(event_type=event_type, is_enabled=True)

    def _get_preferences(self):
        request = self.factory.get('/api/plugins/notifications/notifications/preferences/')
        force_authenticate(request, user=self.user)
        view = NotificationViewSet.as_view({'get': 'preferences'})
        return view(request)

    def test_preferences_queries_event_type_configs_once_not_per_row(self):
        # Fixed baseline (team-recipient checks + the user's own
        # NotificationPreference rows + one NotificationEventTypeConfig
        # dict query) regardless of how many event types are available. An
        # N+1 in `get_globally_enabled` would add one more query per
        # available event type (8 own types for a non-team recipient) on
        # top of this baseline.
        with self.assertNumQueries(5):
            response = self._get_preferences()

        self.assertEqual(response.status_code, 200)
        self.assertGreater(len(response.data), 1)
        self.assertTrue(all(row['globally_enabled'] for row in response.data))
