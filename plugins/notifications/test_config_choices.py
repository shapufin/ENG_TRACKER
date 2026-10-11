"""Preference groups are display-only; the admin kill-switch accepts real event types only."""
from django.test import SimpleTestCase

from plugins.notifications.models import NotificationEventTypeConfig, NotificationPreference


class ConfigEventTypeChoicesTests(SimpleTestCase):
    def setUp(self):
        # Registers the scorecard types so their group keys exist, as in production.
        from plugins.tl_scorecard import notification_types  # noqa: F401

    def _choices(self, model, field_name):
        return dict(model._meta.get_field(field_name).flatchoices)

    def test_config_choices_exclude_preference_group_keys(self):
        choices = self._choices(NotificationEventTypeConfig, 'event_type')
        self.assertNotIn('hbpr_meetings', choices)
        self.assertNotIn('hbpr_team_risks', choices)

    def test_config_choices_keep_real_event_types(self):
        choices = self._choices(NotificationEventTypeConfig, 'event_type')
        self.assertIn('own_leave_submitted', choices)
        self.assertIn('scorecard_flag_raised', choices)

    def test_preference_choices_still_include_group_keys(self):
        choices = self._choices(NotificationPreference, 'event_type')
        self.assertIn('hbpr_meetings', choices)
        self.assertIn('own_leave_submitted', choices)
