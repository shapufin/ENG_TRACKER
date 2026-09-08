"""
Background export service for the Analytics plugin.

Generates Excel/CSV reports in a background thread, stores the file on
disk, and updates the ExportJob status. Uses Django's close_old_connections
to prevent connection leaks in the thread.

Usage:
    job = ExportJob.objects.create(...)
    ExportRunner.start_deferred(job.id)
    # Poll job.status until 'completed'
    # Download via ExportRunner.get_file(job)
"""
import os
import threading
import logging
from django.utils import timezone
from django.db import close_old_connections
from django.conf import settings

from .reports import AnalyticsReportGenerator

logger = logging.getLogger(__name__)

# Store export files in a subdirectory of MEDIA_ROOT.
# Created lazily on first use, not at import time — avoids crashing
# the entire analytics plugin if MEDIA_ROOT isn't writable yet.
EXPORT_DIR = os.path.join(getattr(settings, 'MEDIA_ROOT', '/tmp'), 'analytics_exports')  # nosec B108 — /tmp is a fallback only; MEDIA_ROOT is set in production
_export_dir_ready = False


def _ensure_export_dir():
    """Create the export directory if it doesn't exist. Called lazily."""
    global _export_dir_ready
    if not _export_dir_ready:
        os.makedirs(EXPORT_DIR, exist_ok=True)
        _export_dir_ready = True


class ExportRunner:
    """Manages background export jobs."""

    @classmethod
    def start_deferred(cls, job_id):
        """Start the export after the current transaction commits.

        If ATOMIC_REQUESTS is on, the job row isn't visible to other
        connections until commit. Using transaction.on_commit ensures
        the thread only starts once the row is durable. If no
        transaction is active, on_commit fires immediately.
        """
        from django.db import transaction
        transaction.on_commit(lambda: cls._start_thread(job_id))

    @classmethod
    def _start_thread(cls, job_id):
        """Start the background thread for a given job ID."""
        thread = threading.Thread(
            target=cls._run_export,
            args=(job_id,),
            daemon=True,
        )
        thread.start()

    @classmethod
    def _run_export(cls, job_id):
        """Run the export in a background thread."""
        from .models import ExportJob

        try:
            close_old_connections()
            job = ExportJob.objects.get(id=job_id)
            job.status = 'running'
            job.save(update_fields=['status'])

            params = job.filter_params or {}
            period = params.get('period', 'month')
            date_from = params.get('date_from')
            date_to = params.get('date_to')
            teams = params.get('teams', [])
            users = params.get('users', [])
            statuses = params.get('statuses', [])
            categories = params.get('categories', [])

            if job.report_format == 'excel':
                data = AnalyticsReportGenerator.generate_excel_report(
                    period, date_from, date_to, teams, users, statuses, categories
                )
                ext = 'xlsx'
            else:
                data = AnalyticsReportGenerator.generate_csv_report(
                    period, date_from, date_to, teams, users, statuses, categories
                )
                ext = 'csv'

            # Write to disk
            _ensure_export_dir()
            filename = f"analytics_export_{job.id}_{timezone.now().strftime('%Y%m%d')}.{ext}"
            file_path = os.path.join(EXPORT_DIR, filename)
            mode = 'wb' if isinstance(data, bytes) else 'w'
            with open(file_path, mode) as f:
                f.write(data)

            job.file_path = file_path
            job.file_size_bytes = os.path.getsize(file_path)
            job.status = 'completed'
            job.completed_at = timezone.now()
            job.save(update_fields=['file_path', 'file_size_bytes', 'status', 'completed_at'])

            logger.info(f"Export job {job.id} completed: {file_path} ({job.file_size_bytes} bytes)")

        except Exception as e:
            logger.error(f"Export job {job_id} failed: {e}", exc_info=True)
            try:
                job = ExportJob.objects.get(id=job_id)
                job.status = 'failed'
                job.error_message = str(e)
                job.completed_at = timezone.now()
                job.save(update_fields=['status', 'error_message', 'completed_at'])
            except Exception:
                pass
        finally:
            close_old_connections()

    @classmethod
    def get_file_path(cls, job):
        """Return the file path for a completed job, or None."""
        if job.is_ready and os.path.exists(job.file_path):
            return job.file_path
        return None
