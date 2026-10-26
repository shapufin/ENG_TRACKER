"""
Monthly Audit Log Rotation and Compression Service.

Rotates, compresses into .json.gz, and safely archives previous month audit logs
to free database space and prevent log bloat.
"""

from __future__ import annotations

import gzip
import json
import logging
import os
import re
from datetime import datetime, timezone as dt_timezone
from pathlib import Path
from typing import Any

from django.conf import settings
from django.utils import timezone

from core.utils.timezone_local import business_today, business_tz

logger = logging.getLogger(__name__)

ARCHIVE_FILENAME_REGEX = re.compile(r'^audit_logs_(\d{4})_(\d{2})(?:_\w+)?\.json\.gz$')


def get_archive_dir() -> Path:
    """Return the filesystem directory where compressed audit archives reside."""
    archive_dir = Path(settings.MEDIA_ROOT) / 'audit_archives'
    archive_dir.mkdir(parents=True, exist_ok=True)
    return archive_dir


def get_target_month(month_str: str | None = None) -> tuple[int, int, datetime, datetime]:
    """Calculate the target calendar month boundary in the business timezone.

    Returns:
        (year, month, start_datetime, end_datetime)
    """
    tz = business_tz()

    if month_str:
        # Expected format: "YYYY-MM"
        parts = month_str.strip().split('-')
        if len(parts) != 2:
            raise ValueError(f"Invalid month format: {month_str}. Expected YYYY-MM.")
        year = int(parts[0])
        month = int(parts[1])
        if not (1 <= month <= 12):
            raise ValueError(f"Invalid month number: {month}. Must be 1-12.")
    else:
        # Default to the full previous calendar month
        today = business_today()
        if today.month == 1:
            year = today.year - 1
            month = 12
        else:
            year = today.year
            month = today.month - 1

    start_dt = datetime(year, month, 1, 0, 0, 0, tzinfo=tz)
    if month == 12:
        end_dt = datetime(year + 1, 1, 1, 0, 0, 0, tzinfo=tz)
    else:
        end_dt = datetime(year, month + 1, 1, 0, 0, 0, tzinfo=tz)

    return year, month, start_dt, end_dt


def get_archive_status() -> dict[str, Any]:
    """Retrieve rotation status, count of eligible logs in the previous month,

    and a list of existing archive files.
    """
    from apps.reports.models import AuditLog

    year, month, start_dt, end_dt = get_target_month()
    target_month_str = f"{year}-{month:02d}"
    target_month_label = start_dt.strftime('%B %Y')

    core_count = AuditLog.objects.filter(timestamp__gte=start_dt, timestamp__lt=end_dt).count()

    plugin_count = 0
    try:
        from plugins.audit_log.models import AuditLog as PluginAuditLog
        plugin_count = PluginAuditLog.objects.filter(timestamp__gte=start_dt, timestamp__lt=end_dt).count()
    except Exception:
        pass

    archive_dir = get_archive_dir()
    archives = []
    if archive_dir.exists():
        for file in sorted(archive_dir.glob('audit_logs_*.json.gz'), reverse=True):
            if not ARCHIVE_FILENAME_REGEX.match(file.name):
                continue
            stat = file.stat()
            archives.append({
                'filename': file.name,
                'size_bytes': stat.st_size,
                'size_formatted': _format_file_size(stat.st_size),
                'created_at': datetime.fromtimestamp(stat.st_mtime, tz=dt_timezone.utc).isoformat(),
            })

    return {
        'target_month': target_month_str,
        'target_month_label': target_month_label,
        'eligible_count': core_count + plugin_count,
        'core_count': core_count,
        'plugin_count': plugin_count,
        'archives': archives,
    }


def archive_month(month_str: str | None = None, delete_after: bool = True) -> dict[str, Any]:
    """Export and gzip-compress logs for the specified calendar month,

    then delete the archived records from the live database.
    """
    from apps.reports.models import AuditLog

    year, month, start_dt, end_dt = get_target_month(month_str)
    filename = f"audit_logs_{year}_{month:02d}.json.gz"
    archive_dir = get_archive_dir()
    target_path = archive_dir / filename
    temp_path = archive_dir / f"{filename}.tmp"

    core_qs = AuditLog.objects.filter(
        timestamp__gte=start_dt,
        timestamp__lt=end_dt,
    ).select_related('user').order_by('timestamp')

    plugin_qs = None
    try:
        from plugins.audit_log.models import AuditLog as PluginAuditLog
        plugin_qs = PluginAuditLog.objects.filter(
            timestamp__gte=start_dt,
            timestamp__lt=end_dt,
        ).select_related('user').order_by('timestamp')
    except Exception:
        pass

    core_count = core_qs.count()
    plugin_count = plugin_qs.count() if plugin_qs is not None else 0
    total_count = core_count + plugin_count

    if total_count == 0:
        return {
            'success': True,
            'archived_count': 0,
            'filename': filename,
            'month': f"{year}-{month:02d}",
            'month_label': start_dt.strftime('%B %Y'),
            'message': f"No audit records found for {start_dt.strftime('%B %Y')}.",
            'size_bytes': 0,
        }

    # Stream out into gzip compressed JSON lines
    try:
        with gzip.open(temp_path, 'wt', encoding='utf-8') as gz:
            # Metadata header
            header = {
                '_archive_metadata': {
                    'year': year,
                    'month': month,
                    'exported_at': timezone.now().isoformat(),
                    'total_records': total_count,
                    'core_records': core_count,
                    'plugin_records': plugin_count,
                    'start_range': start_dt.isoformat(),
                    'end_range': end_dt.isoformat(),
                }
            }
            gz.write(json.dumps(header) + '\n')

            # Write core audit logs
            for log in core_qs.iterator(chunk_size=1000):
                record = {
                    'source': 'core_reports',
                    'id': log.id,
                    'timestamp': log.timestamp.isoformat() if log.timestamp else None,
                    'user_id': log.user_id,
                    'username': log.user.username if log.user else None,
                    'action': log.action,
                    'model_name': log.model_name,
                    'object_id': log.object_id,
                    'object_repr': log.object_repr,
                    'changes_summary': log.changes_summary,
                    'old_values': log.old_values,
                    'new_values': log.new_values,
                    'ip_address': log.ip_address,
                    'user_agent': log.user_agent,
                    'extra_data': log.extra_data,
                }
                gz.write(json.dumps(record) + '\n')

            # Write plugin audit logs if available
            if plugin_qs is not None:
                for plog in plugin_qs.iterator(chunk_size=1000):
                    record = {
                        'source': 'plugin_audit_log',
                        'id': plog.id,
                        'timestamp': plog.timestamp.isoformat() if plog.timestamp else None,
                        'user_id': plog.user_id,
                        'username': plog.user.username if plog.user else None,
                        'action': plog.action,
                        'description': plog.description,
                        'object_id': plog.object_id,
                        'status': plog.status,
                        'ip_address': plog.ip_address,
                        'user_agent': plog.user_agent,
                        'old_values': plog.old_values,
                        'new_values': plog.new_values,
                    }
                    gz.write(json.dumps(record) + '\n')

        # Verify temp file is non-empty before committing
        if not temp_path.exists() or temp_path.stat().st_size == 0:
            raise IOError("Archive compression failed: file is missing or zero bytes.")

        # Atomic replace or safe fallback if target is locked by an OS reader/stream
        try:
            if target_path.exists():
                target_path.unlink()
            temp_path.replace(target_path)
        except (PermissionError, OSError) as exc:
            logger.warning(
                f"Could not overwrite target file {target_path} ({exc}); generating timestamped archive filename."
            )
            stamp = timezone.now().strftime("%Y%m%d_%H%M%S")
            filename = f"audit_logs_{year}_{month:02d}_{stamp}.json.gz"
            target_path = archive_dir / filename
            temp_path.replace(target_path)

        final_size = target_path.stat().st_size

        # Delete archived records from the live database
        if delete_after:
            from django.db import transaction
            with transaction.atomic():
                AuditLog.objects.filter(timestamp__gte=start_dt, timestamp__lt=end_dt).delete()
                if plugin_qs is not None:
                    from plugins.audit_log.models import AuditLog as PluginAuditLog
                    PluginAuditLog.objects.filter(timestamp__gte=start_dt, timestamp__lt=end_dt).delete()

        logger.info(
            f"Archived and rotated {total_count} audit logs for {year}-{month:02d} "
            f"into {filename} ({final_size} bytes)."
        )

        return {
            'success': True,
            'archived_count': total_count,
            'core_count': core_count,
            'plugin_count': plugin_count,
            'filename': filename,
            'month': f"{year}-{month:02d}",
            'month_label': start_dt.strftime('%B %Y'),
            'size_bytes': final_size,
            'size_formatted': _format_file_size(final_size),
        }
    except Exception:
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)
        raise


def get_archive_file(filename: str) -> Path:
    """Validate and locate an archive file for download, preventing traversal attacks."""
    clean_name = os.path.basename(filename.strip())
    if not ARCHIVE_FILENAME_REGEX.match(clean_name):
        raise ValueError("Invalid archive filename pattern.")

    archive_dir = get_archive_dir().resolve()
    path = (archive_dir / clean_name).resolve()
    if not path.is_relative_to(archive_dir):
        raise ValueError("Archive path traversal forbidden.")
    if not path.is_file() or not path.exists():
        raise FileNotFoundError(f"Archive file '{clean_name}' does not exist.")

    return path


def _format_file_size(num_bytes: int) -> str:
    """Human readable file size string."""
    if num_bytes < 1024:
        return f"{num_bytes} B"
    elif num_bytes < 1024 * 1024:
        return f"{num_bytes / 1024:.1f} KB"
    else:
        return f"{num_bytes / (1024 * 1024):.1f} MB"
