"""The scheduler runs enabled plugins' jobs unattended (plan Y1).

There is no Celery or cron container: one long-lived ``run_scheduler`` process
calls each plugin's ``get_scheduled_jobs()`` on its own interval.
"""
import os
import tempfile
from unittest import mock

from django.core.management import call_command
from django.test import SimpleTestCase

from core.plugins.base import BasePlugin
from core.plugins.scheduler import ScheduledJob, Scheduler, collect_jobs

CALLS = []


def record_a():
    CALLS.append('a')


def record_b():
    CALLS.append('b')


def explode():
    CALLS.append('boom')
    raise RuntimeError('job failed')


class _Plugin(BasePlugin):
    name = 'fake'
    verbose_name = 'Fake'
    description = 'x'
    version = '1'

    def __init__(self, jobs):
        self._jobs = jobs

    def get_scheduled_jobs(self):
        return self._jobs


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


class CollectJobsTests(SimpleTestCase):
    def test_base_plugin_has_no_jobs_by_default(self):
        self.assertEqual(_Plugin([]).get_scheduled_jobs(), [])
        self.assertEqual(BasePlugin.get_scheduled_jobs(_Plugin([])), [])

    def test_collects_jobs_from_the_given_plugins_with_prefixed_names(self):
        plugins = {'fake': _Plugin([('sync', 60, 'apps.plugins.test_scheduler.record_a')])}
        jobs = collect_jobs(plugins)
        self.assertEqual([j.name for j in jobs], ['fake.sync'])
        self.assertEqual(jobs[0].interval, 60)

    def test_only_enabled_plugins_are_used_by_default(self):
        plugins = {'fake': _Plugin([('sync', 60, 'apps.plugins.test_scheduler.record_a')])}
        with mock.patch('core.plugins.scheduler.plugin_registry') as registry:
            registry.get_active_plugins.return_value = plugins
            jobs = collect_jobs()
        registry.get_active_plugins.assert_called_once_with()
        self.assertEqual(len(jobs), 1)

    def test_malformed_job_is_skipped_without_hiding_the_rest(self):
        plugins = {
            'bad': _Plugin([('only-a-name',)]),
            'fake': _Plugin([('sync', 60, 'apps.plugins.test_scheduler.record_a')]),
        }
        with self.assertLogs('core.plugins.scheduler', level='ERROR'):
            jobs = collect_jobs(plugins)
        self.assertEqual([j.name for j in jobs], ['fake.sync'])

    def test_non_positive_interval_is_rejected(self):
        plugins = {'bad': _Plugin([('sync', 0, 'apps.plugins.test_scheduler.record_a')])}
        with self.assertLogs('core.plugins.scheduler', level='ERROR'):
            self.assertEqual(collect_jobs(plugins), [])


class SchedulerRunTests(SimpleTestCase):
    def setUp(self):
        CALLS.clear()
        self.clock = FakeClock()
        patcher = mock.patch('core.plugins.scheduler.close_old_connections')
        self.close_connections = patcher.start()
        self.addCleanup(patcher.stop)

    def _scheduler(self, jobs, **kwargs):
        return Scheduler(lambda: jobs, clock=self.clock, **kwargs)

    def test_a_new_job_is_due_immediately_then_waits_for_its_interval(self):
        scheduler = self._scheduler([ScheduledJob('x.a', 60, 'apps.plugins.test_scheduler.record_a')])
        scheduler.run_due()
        scheduler.run_due()
        self.assertEqual(CALLS, ['a'])
        self.clock.advance(59)
        scheduler.run_due()
        self.assertEqual(CALLS, ['a'])
        self.clock.advance(1)
        scheduler.run_due()
        self.assertEqual(CALLS, ['a', 'a'])

    def test_jobs_run_on_their_own_intervals(self):
        scheduler = self._scheduler([
            ScheduledJob('x.a', 10, 'apps.plugins.test_scheduler.record_a'),
            ScheduledJob('x.b', 100, 'apps.plugins.test_scheduler.record_b'),
        ])
        scheduler.run_due()
        self.clock.advance(10)
        scheduler.run_due()
        self.assertEqual(CALLS, ['a', 'b', 'a'])

    def test_a_failing_job_is_logged_rescheduled_and_does_not_stop_others(self):
        scheduler = self._scheduler([
            ScheduledJob('x.boom', 30, 'apps.plugins.test_scheduler.explode'),
            ScheduledJob('x.a', 30, 'apps.plugins.test_scheduler.record_a'),
        ])
        with self.assertLogs('core.plugins.scheduler', level='ERROR') as logs:
            scheduler.run_due()
            scheduler.run_due()  # not due again: the failure did not cause a tight loop
        self.assertEqual(CALLS, ['boom', 'a'])
        self.assertIn('x.boom', logs.output[0])

    def test_unimportable_job_does_not_crash_the_loop(self):
        scheduler = self._scheduler([ScheduledJob('x.gone', 30, 'apps.plugins.nope.missing')])
        with self.assertLogs('core.plugins.scheduler', level='ERROR'):
            scheduler.run_due()

    def test_stale_database_connections_are_closed_before_each_job(self):
        scheduler = self._scheduler([ScheduledJob('x.a', 60, 'apps.plugins.test_scheduler.record_a')])
        scheduler.run_due()
        self.close_connections.assert_called()

    def test_a_plugin_enabled_later_starts_running(self):
        jobs = []
        scheduler = Scheduler(lambda: jobs, clock=self.clock)
        scheduler.run_due()
        jobs.append(ScheduledJob('x.a', 60, 'apps.plugins.test_scheduler.record_a'))
        scheduler.run_due()
        self.assertEqual(CALLS, ['a'])

    def test_heartbeat_file_is_touched_every_tick_even_with_no_jobs(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'hb')
            scheduler = self._scheduler([], heartbeat_path=path)
            scheduler.run_due()
            self.assertTrue(os.path.exists(path))

    def test_a_failing_jobs_provider_is_logged_and_the_tick_recovers(self):
        # collect_jobs() hits the Plugin table on every tick: a transient DB
        # error must skip the tick, not kill the process.
        jobs = [ScheduledJob('x.a', 60, 'apps.plugins.test_scheduler.record_a')]
        calls = {'n': 0}

        def provider():
            calls['n'] += 1
            if calls['n'] == 1:
                raise RuntimeError('db is gone')
            return jobs

        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'hb')
            scheduler = Scheduler(provider, clock=self.clock, heartbeat_path=path)
            with self.assertLogs('core.plugins.scheduler', level='ERROR'):
                scheduler.run_due()
            self.assertEqual(CALLS, [])
            self.assertTrue(os.path.exists(path))
            scheduler.run_due()
        self.assertEqual(CALLS, ['a'])

    def test_stale_database_connections_are_closed_every_tick(self):
        scheduler = self._scheduler([])
        scheduler.run_due()
        self.close_connections.assert_called()


class RunSchedulerCommandTests(SimpleTestCase):
    def setUp(self):
        CALLS.clear()

    def test_once_runs_due_jobs_and_exits(self):
        jobs = [ScheduledJob('x.a', 60, 'apps.plugins.test_scheduler.record_a')]
        with mock.patch('apps.plugins.management.commands.run_scheduler.collect_all_jobs', return_value=jobs), \
                mock.patch('core.plugins.scheduler.close_old_connections'):
            call_command('run_scheduler', '--once')
        self.assertEqual(CALLS, ['a'])


class HeartbeatTests(SimpleTestCase):
    """A long job (a multi-GB export) must not make the healthcheck think the
    scheduler died: the heartbeat is touched from its own thread."""

    def test_heartbeat_keeps_beating_while_the_caller_is_busy(self):
        import time

        from core.plugins.scheduler import Heartbeat

        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'hb')
            heartbeat = Heartbeat(path, interval=0.01)
            heartbeat.start()
            try:
                self._wait_for(lambda: os.path.exists(path))
                os.remove(path)
                time.sleep(0)  # the caller is "busy"; only the thread can recreate it
                self._wait_for(lambda: os.path.exists(path))
            finally:
                heartbeat.stop()

    def test_stop_ends_the_thread(self):
        from core.plugins.scheduler import Heartbeat

        with tempfile.TemporaryDirectory() as tmp:
            heartbeat = Heartbeat(os.path.join(tmp, 'hb'), interval=0.01)
            heartbeat.start()
            heartbeat.stop()
            self.assertFalse(heartbeat.is_alive())

    @staticmethod
    def _wait_for(condition, timeout=2.0):
        import time

        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if condition():
                return
            time.sleep(0.005)
        raise AssertionError('condition not met in time')


STATE = {}


def block_past_the_limit():
    """A job that hangs: the clock jumps past the limit while it is still running."""
    scheduler, clock = STATE['scheduler'], STATE['clock']
    STATE['before'] = scheduler.stuck_job()
    clock.advance(STATE['advance'])
    STATE['during'] = scheduler.stuck_job()


class WatchdogTests(SimpleTestCase):
    """M5 (audit 2026-11-16): a job stuck on SMTP, a lock or a dead socket must not keep the
    healthcheck green forever while every later job waits behind it."""

    def setUp(self):
        self.clock = FakeClock()
        patcher = mock.patch('core.plugins.scheduler.close_old_connections')
        patcher.start()
        self.addCleanup(patcher.stop)
        STATE.clear()

    def _run_blocking_job(self, advance, timeout=600):
        scheduler = Scheduler(
            lambda: [ScheduledJob('x.hang', 60, 'apps.plugins.test_scheduler.block_past_the_limit')],
            clock=self.clock, job_timeout=timeout,
        )
        STATE.update(scheduler=scheduler, clock=self.clock, advance=advance)
        scheduler.run_due()
        return scheduler

    def test_nothing_is_stuck_when_no_job_runs(self):
        scheduler = Scheduler(lambda: [], clock=self.clock, job_timeout=600)
        self.assertIsNone(scheduler.stuck_job())

    def test_a_job_past_its_limit_is_reported_while_it_runs(self):
        scheduler = self._run_blocking_job(advance=601)
        self.assertIsNone(STATE['before'])
        self.assertEqual(STATE['during'], 'x.hang')
        self.assertIsNone(scheduler.stuck_job())  # finished: nothing running any more

    def test_a_long_job_inside_its_limit_is_not_stuck(self):
        self._run_blocking_job(advance=599)
        self.assertIsNone(STATE['during'])

    def test_a_failing_job_does_not_stay_marked_as_running(self):
        scheduler = Scheduler(
            lambda: [ScheduledJob('x.boom', 60, 'apps.plugins.test_scheduler.explode')],
            clock=self.clock, job_timeout=600,
        )
        scheduler.run_due()
        self.clock.advance(10_000)
        self.assertIsNone(scheduler.stuck_job())


class HeartbeatWatchdogTests(SimpleTestCase):
    def test_a_stuck_job_stops_the_heartbeat_and_ends_the_process(self):
        from core.plugins.scheduler import Heartbeat

        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'hb')
            on_stuck = mock.Mock()
            heartbeat = Heartbeat(path, interval=0.01, stuck=lambda: 'x.hang', on_stuck=on_stuck)
            heartbeat.start()
            heartbeat.join(timeout=2)

            on_stuck.assert_called_once_with('x.hang')
            self.assertFalse(heartbeat.is_alive())
            self.assertFalse(os.path.exists(path))  # the healthcheck goes red as well

    def test_a_healthy_scheduler_keeps_beating(self):
        from core.plugins.scheduler import Heartbeat

        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'hb')
            on_stuck = mock.Mock()
            heartbeat = Heartbeat(path, interval=0.01, stuck=lambda: None, on_stuck=on_stuck)
            heartbeat.start()
            try:
                HeartbeatTests._wait_for(lambda: os.path.exists(path))
            finally:
                heartbeat.stop()
            on_stuck.assert_not_called()

    def test_the_watchdog_runs_even_without_a_heartbeat_file(self):
        from core.plugins.scheduler import Heartbeat

        on_stuck = mock.Mock()
        heartbeat = Heartbeat('', interval=0.01, stuck=lambda: 'x.hang', on_stuck=on_stuck)
        heartbeat.start()
        heartbeat.join(timeout=2)
        on_stuck.assert_called_once_with('x.hang')
