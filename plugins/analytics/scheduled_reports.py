"""Send the analytics reports that are due.

One implementation behind the scheduler job (``run_due_reports``, hourly) and the
``run_scheduled_reports`` command. Safe to repeat: each due report is claimed with a row
lock and its ``next_run_at`` is moved forward in the same transaction as the send, so two
overlapping runs never send the same report twice (audit 2026-11-16 M2).
"""
from __future__ import annotations

import calendar
import logging
from datetime import timedelta

from django.conf import settings
from django.core.mail import EmailMessage
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .models import ScheduledReport
from .reports import AnalyticsReportGenerator

logger = logging.getLogger(__name__)

_FORMATS = {
    'excel': ('generate_excel_report', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'),
    'csv': ('generate_csv_report', 'text/csv', 'csv'),
    'pdf': ('generate_pdf_report', 'application/pdf', 'pdf'),
}


def next_run_after(schedule_type: str, now):
    """The next run: a day, a week, or the same day next month (clamped to its last day)."""
    if schedule_type == 'daily':
        return now + timedelta(days=1)
    if schedule_type == 'weekly':
        return now + timedelta(weeks=1)
    if schedule_type == 'monthly':
        year, month = (now.year + 1, 1) if now.month == 12 else (now.year, now.month + 1)
        day = min(now.day, calendar.monthrange(year, month)[1])
        return now.replace(year=year, month=month, day=day)
    return None


def _render(report: ScheduledReport):
    """(bytes, content_type, extension) for the report's own filter preset, or None."""
    spec = _FORMATS.get(report.report_format)
    if spec is None:
        return None
    method, content_type, extension = spec
    preset = report.filter_preset or {}
    data = getattr(AnalyticsReportGenerator, method)(
        preset.get('period', 'month'), preset.get('date_from'), preset.get('date_to'),
        preset.get('teams', []), preset.get('users', []),
        preset.get('statuses', []), preset.get('categories', []),
    )
    return (data, content_type, extension) if data else None


def _due(now):
    return Q(is_active=True) & (Q(next_run_at__lte=now) | Q(next_run_at__isnull=True))


def run_due_reports(now=None) -> int:
    """Send every due report once and schedule its next run. Returns how many were sent."""
    now = now or timezone.now()
    sent = 0
    for report_id in list(ScheduledReport.objects.filter(_due(now)).values_list('pk', flat=True)):
        try:
            with transaction.atomic():
                report = ScheduledReport.objects.select_for_update(skip_locked=True).filter(
                    _due(now), pk=report_id
                ).first()
                if report is None or not report.recipients:
                    continue
                rendered = _render(report)
                if rendered is None:
                    logger.warning('Scheduled report %s produced no file; nothing sent.', report.pk)
                    continue
                data, content_type, extension = rendered
                email = EmailMessage(
                    f'Scheduled Analytics Report: {report.name}',
                    f'Please find attached the scheduled analytics report: {report.name}\n\n'
                    f'Description: {report.description}',
                    settings.DEFAULT_FROM_EMAIL,
                    report.recipients,
                )
                email.attach(f"{report.name.replace(' ', '_')}_{now.strftime('%Y%m%d')}.{extension}", data, content_type)
                email.send()
                report.last_run_at = now
                report.next_run_at = next_run_after(report.schedule_type, now)
                report.save(update_fields=['last_run_at', 'next_run_at'])
                sent += 1
        except Exception:  # one broken report must not stop the others; it stays due and retries next tick
            logger.exception('Scheduled report %s failed', report_id)
    return sent


def purge_old_data():
    """Daily retention purge (audit M9); same work as ``manage.py purge_analytics_data``."""
    from django.core.management import call_command
    call_command('purge_analytics_data', verbosity=0)
