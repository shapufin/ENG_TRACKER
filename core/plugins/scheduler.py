"""Runs enabled plugins' background jobs from one long-lived process.

The stack has no Celery or cron container. ``manage.py run_scheduler`` (the
``scheduler`` compose service) loops over ``Scheduler.run_due()``; a plugin opts
in through ``BasePlugin.get_scheduled_jobs()``.
"""
import logging
import os
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Optional

from django.db import close_old_connections
from django.utils.module_loading import import_string

from core.plugins.registry import plugin_registry

logger = logging.getLogger(__name__)

# A single run longer than this is treated as hung (SMTP, a lock, a dead socket). The
# longest legitimate job is a large export; raise SCHEDULER_JOB_TIMEOUT if one needs more.
DEFAULT_JOB_TIMEOUT_SECONDS = 1800


@dataclass(frozen=True)
class ScheduledJob:
    name: str        # "<plugin>.<job>"
    interval: int    # seconds between runs
    target: str      # dotted path of a no-argument callable


def collect_jobs(plugins: Optional[Dict[str, object]] = None) -> List[ScheduledJob]:
    """Jobs of the enabled plugins (or of ``plugins`` when given).

    One plugin with a malformed job never hides the others: it is logged and skipped.
    """
    if plugins is None:
        plugins = plugin_registry.get_active_plugins()
    jobs: List[ScheduledJob] = []
    for plugin_name, plugin in plugins.items():
        try:
            for name, interval, target in plugin.get_scheduled_jobs():
                if not isinstance(interval, int) or interval <= 0:
                    raise ValueError(f'job {name!r} needs a positive integer interval')
                jobs.append(ScheduledJob(f'{plugin_name}.{name}', interval, target))
        except Exception:
            logger.exception('Ignoring malformed scheduled jobs of plugin %s', plugin_name)
    return jobs


class Scheduler:
    """Decides which jobs are due and runs them, one failure never stopping the rest."""

    def __init__(
        self,
        jobs_provider: Callable[[], Iterable[ScheduledJob]],
        clock: Callable[[], float] = time.monotonic,
        heartbeat_path: Optional[str] = None,
        job_timeout: float = DEFAULT_JOB_TIMEOUT_SECONDS,
    ):
        self._jobs_provider = jobs_provider
        self._job_timeout = job_timeout
        self._running: Optional[tuple] = None  # (job name, started at), read by the watchdog thread
        self._clock = clock
        self._heartbeat_path = heartbeat_path
        self._next_run: Dict[str, float] = {}

    def run_due(self) -> None:
        now = self._clock()
        # Expire connections past DB_CONN_MAX_AGE before the tick query: the loop
        # is not request-driven, so nothing else retires them between job runs.
        close_old_connections()
        try:
            jobs = list(self._jobs_provider())
        except Exception:
            # A transient DB error must not kill the process. The next tick
            # retries; Docker restarts are the last resort, not the plan.
            logger.exception('Could not collect scheduled jobs; skipping this tick')
            self._touch_heartbeat()
            return
        for job in jobs:
            if self._next_run.get(job.name, now) > now:
                continue
            # Set before running so a failing job waits out its interval too.
            self._next_run[job.name] = now + job.interval
            self._run(job)
        self._touch_heartbeat()

    def stuck_job(self) -> Optional[str]:
        """Name of the job that has been running longer than the limit, else None."""
        running = self._running
        if running and self._clock() - running[1] > self._job_timeout:
            return running[0]
        return None

    def _run(self, job: ScheduledJob) -> None:
        # A process that lives for weeks must not hold on to a connection the
        # database has already dropped.
        close_old_connections()
        self._running = (job.name, self._clock())
        try:
            import_string(job.target)()
        except Exception:
            logger.exception('Scheduled job %s failed', job.name)
        finally:
            self._running = None
            close_old_connections()

    def _touch_heartbeat(self) -> None:
        if not self._heartbeat_path:
            return
        try:
            Path(self._heartbeat_path).touch()
        except OSError:
            logger.warning('Could not touch scheduler heartbeat %s', self._heartbeat_path, exc_info=True)


def _exit_process(job_name: str) -> None:
    logger.critical('Scheduled job %s is stuck past its limit; exiting so the container restarts', job_name)
    os._exit(70)


class Heartbeat(threading.Thread):
    """Touches a file from its own thread, so a long job (a multi-GB export)
    cannot make the compose healthcheck think the scheduler died.

    It is also the watchdog: when ``stuck()`` names a job that has run past its limit the
    thread stops touching the file and calls ``on_stuck`` (by default it ends the
    process), so ``restart: unless-stopped`` recovers a scheduler that a hung job froze.
    """

    def __init__(
        self,
        path: str,
        interval: float = 10.0,
        stuck: Optional[Callable[[], Optional[str]]] = None,
        on_stuck: Callable[[str], None] = _exit_process,
    ):
        super().__init__(name='scheduler-heartbeat', daemon=True)
        self._path = path
        self._interval = interval
        self._stuck = stuck
        self._on_stuck = on_stuck
        self._stop_event = threading.Event()

    def run(self) -> None:
        while True:
            stuck_job = self._stuck() if self._stuck else None
            if stuck_job:
                self._on_stuck(stuck_job)
                return
            if self._path:
                try:
                    Path(self._path).touch()
                except OSError:
                    logger.warning('Could not touch scheduler heartbeat %s', self._path, exc_info=True)
            if self._stop_event.wait(self._interval):
                return

    def stop(self) -> None:
        self._stop_event.set()
        self.join(timeout=5)


# Housekeeping that belongs to no plugin (audit M9): it must run whichever plugins are on.
CORE_JOBS = [
    ScheduledJob('core.flush_expired_tokens', 86400, 'core.plugins.housekeeping.flush_expired_tokens'),
]


def collect_all_jobs() -> List[ScheduledJob]:
    """Core jobs plus the jobs of the enabled plugins: what the scheduler process runs."""
    return [*CORE_JOBS, *collect_jobs()]
