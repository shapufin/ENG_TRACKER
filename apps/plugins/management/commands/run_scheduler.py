"""Long-lived process that runs enabled plugins' background jobs.

Started by the ``scheduler`` compose service. Safe to run by hand with ``--once``.
"""
import os
import signal
import threading

from django.core.management.base import BaseCommand

from core.plugins.scheduler import DEFAULT_JOB_TIMEOUT_SECONDS, Heartbeat, Scheduler, collect_all_jobs


class Command(BaseCommand):
    help = "Run the scheduled jobs of enabled plugins (use --once to run what is due and exit)."

    def add_arguments(self, parser):
        parser.add_argument('--once', action='store_true', help='Run the due jobs once and exit.')
        parser.add_argument('--tick', type=float, default=5.0, help='Seconds between checks (default 5).')
        parser.add_argument(
            '--heartbeat-file',
            default=os.environ.get('SCHEDULER_HEARTBEAT_FILE', ''),
            help='File touched every tick; the compose healthcheck watches its age.',
        )

    def handle(self, *args, **options):
        job_timeout = float(os.environ.get('SCHEDULER_JOB_TIMEOUT', DEFAULT_JOB_TIMEOUT_SECONDS))
        scheduler = Scheduler(
            collect_all_jobs, heartbeat_path=options['heartbeat_file'] or None, job_timeout=job_timeout,
        )
        if options['once']:
            scheduler.run_due()
            return

        stop = threading.Event()
        for sig in (signal.SIGTERM, signal.SIGINT):
            signal.signal(sig, lambda *_: stop.set())
        # Always started: besides the healthcheck file it is the watchdog for a hung job.
        heartbeat = Heartbeat(options['heartbeat_file'], stuck=scheduler.stuck_job)
        heartbeat.start()
        self.stdout.write('Scheduler started.')
        try:
            while not stop.is_set():
                scheduler.run_due()
                stop.wait(options['tick'])
        finally:
            heartbeat.stop()
        self.stdout.write('Scheduler stopped.')
