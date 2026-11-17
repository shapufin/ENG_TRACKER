"""M9 (audit 2026-11-16): daily housekeeping runs from the scheduler, not only from host cron or boot."""
from unittest import mock

from django.test import TestCase
from django.utils.module_loading import import_string

from core.plugins.scheduler import CORE_JOBS, collect_all_jobs
from plugins.analytics.plugin import AnalyticsPlugin
from plugins.audit_log.plugin import AuditLogPlugin
from plugins.notifications.plugin import NotificationPlugin


class HousekeepingJobTests(TestCase):
    def _job(self, plugin, name):
        return {n: (i, t) for n, i, t in plugin().get_scheduled_jobs()}[name]

    def test_each_daily_job_is_declared_daily_and_resolves(self):
        for plugin, name in ((NotificationPlugin, 'housekeeping'), (AuditLogPlugin, 'purge'), (AnalyticsPlugin, 'purge')):
            interval, target = self._job(plugin, name)
            self.assertEqual(interval, 86400)
            self.assertTrue(callable(import_string(target)), target)

    def test_core_token_flush_runs_whichever_plugins_are_on(self):
        with mock.patch('core.plugins.scheduler.collect_jobs', return_value=[]):
            names = [j.name for j in collect_all_jobs()]
        self.assertEqual(names, [j.name for j in CORE_JOBS])
        self.assertIn('core.flush_expired_tokens', names)
        self.assertTrue(callable(import_string(CORE_JOBS[0].target)))

    def test_the_jobs_run_the_existing_commands(self):
        calls = []
        record = lambda *a, **k: calls.append(a[0])  # noqa: E731
        with mock.patch('plugins.notifications.housekeeping.call_command', side_effect=record), \
                mock.patch('plugins.notifications.housekeeping.purge_old_idempotency_records'), \
                mock.patch('plugins.audit_log.housekeeping.call_command', side_effect=record), \
                mock.patch('core.plugins.housekeeping.call_command', side_effect=record), \
                mock.patch('django.core.management.call_command', side_effect=record):
            for plugin, name in ((NotificationPlugin, 'housekeeping'), (AuditLogPlugin, 'purge'), (AnalyticsPlugin, 'purge')):
                import_string(self._job(plugin, name)[1])()
            import_string(CORE_JOBS[0].target)()
        self.assertEqual(
            calls, ['prune_notifications', 'purge_audit_logs', 'purge_analytics_data', 'flushexpiredtokens'],
        )
