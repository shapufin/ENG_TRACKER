"""Runs enabled plugins' background jobs from one long-lived process.

The stack has no Celery or cron container. ``manage.py run_scheduler`` (the
``scheduler`` compose service) loops over ``Scheduler.run_due()``; a plugin opts
in through ``BasePlugin.get_scheduled_jobs()``.
"""
import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Optional

from django.db import close_old_connections
from django.utils.module_loading import import_string

from core.plugins.registry import plugin_registry

logger = logging.getLogger(__name__)


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
    ):
        self._jobs_provider = jobs_provider
        self._clock = clock
        self._heartbeat_path = heartbeat_path
        self._next_run: Dict[str, float] = {}

    def run_due(self) -> None:
        now = self._clock()
        for job in self._jobs_provider():
            if self._next_run.get(job.name, now) > now:
                continue
            # Set before running so a failing job waits out its interval too.
            self._next_run[job.name] = now + job.interval
            self._run(job)
        self._touch_heartbeat()

    def _run(self, job: ScheduledJob) -> None:
        # A process that lives for weeks must not hold on to a connection the
        # database has already dropped.
        close_old_connections()
        try:
            import_string(job.target)()
        except Exception:
            logger.exception('Scheduled job %s failed', job.name)
        finally:
            close_old_connections()

    def _touch_heartbeat(self) -> None:
        if not self._heartbeat_path:
            return
        try:
            Path(self._heartbeat_path).touch()
        except OSError:
            logger.warning('Could not touch scheduler heartbeat %s', self._heartbeat_path, exc_info=True)
