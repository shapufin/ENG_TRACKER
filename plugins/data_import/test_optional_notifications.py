"""Standby import must not crash when the notifications plugin is absent."""

import sys
from unittest import mock

from django.test import SimpleTestCase

from plugins.data_import.importers.standby_logs import StandbyLogImporter


class NotifyWithoutPluginTests(SimpleTestCase):
    def test_notify_created_users_is_a_no_op_without_notifications(self):
        context = {
            'standby_created_dates': {1: [__import__('datetime').date(2026, 3, 1)]},
            'standby_created_users': {1: object()},
        }
        with mock.patch.dict(sys.modules, {'plugins.notifications.signals': None}):
            StandbyLogImporter()._notify_created_users(context)
