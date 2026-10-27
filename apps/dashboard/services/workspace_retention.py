"""Retention of calendar workspaces whose team is gone (team lifecycle plan, Phase 4).

Deleting a team detaches its workspace (``team`` goes NULL, ``detached_at`` is stamped)
instead of deleting it. A detached workspace is purged only after ``RETENTION_DAYS``,
and never while it holds holidays or someone still has it active.
"""
from datetime import timedelta

from django.utils import timezone

from apps.dashboard.models.calendar import CalendarWorkspace
from core.services.lifecycle import record_lifecycle_event

RETENTION_DAYS = 365


def purge_detached_workspaces(now=None, dry_run=False):
    """Delete expired, empty, unused detached workspaces. Returns how many (would be) deleted."""
    cutoff = (now or timezone.now()) - timedelta(days=RETENTION_DAYS)
    candidates = (
        CalendarWorkspace.objects.filter(team__isnull=True, detached_at__isnull=False, detached_at__lte=cutoff)
        .filter(holidays__isnull=True)  # any row, soft-deleted too: the delete would take it
        .exclude(user_preferences__is_active=True, user_preferences__is_deleted=False)
    )
    count = 0
    for workspace in candidates:
        count += 1
        if dry_run:
            continue
        record_lifecycle_event(
            None, workspace, 'calendarworkspace', 'DELETE', 'purge',
            old={'code': workspace.code, 'name': workspace.name},
            extra={'detached_at': workspace.detached_at.isoformat()},
        )
        workspace.delete()
    return count

