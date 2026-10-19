"""Core dashboard code must survive a plugin being removed."""

import sys
from datetime import datetime, timezone
from unittest import mock

from django.test import TestCase

from apps.dashboard import admin_overview


class BackupStatusWithoutPluginTests(TestCase):
    def test_backup_status_is_none_when_site_backup_is_not_installed(self):
        with mock.patch.dict(sys.modules, {'plugins.site_backup.models': None}):
            self.assertIsNone(admin_overview.backup_status(datetime.now(timezone.utc)))
