"""Long-lived process that runs enabled plugins' background jobs.

Started by the ``scheduler`` compose service. Safe to run by hand with ``--once``.
"""
import os
import signal
import threading

from django.core.management.base import BaseCommand

from core.plugins.scheduler import Scheduler, collect_jobs


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
        scheduler = Scheduler(collect_jobs, heartbeat_path=options['heartbeat_file'] or None)
        if options['once']:
            scheduler.run_due()
            return

        stop = threading.Event()
        for sig in (signal.SIGTERM, signal.SIGINT):
            signal.signal(sig, lambda *_: stop.set())
        self.stdout.write('Scheduler started.')
        while not stop.is_set():
            scheduler.run_due()
            stop.wait(options['tick'])
        self.stdout.write('Scheduler stopped.')
