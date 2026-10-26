"""Rules for what must survive a client delete, and what an archived client may receive
(plans A1-A2, client archive)."""
import logging

from django.core.exceptions import ValidationError
from django.db.models import CASCADE, PROTECT, Max

logger = logging.getLogger(__name__)

# Reverse M2M links a delete may drop: user assignments are cleared when a
# client is archived, so they never need to block anything.
DELETABLE_LINKS = frozenset({'assigned_users'})


def protected_record_counts(client):
    """``{accessor: count}`` of the records that block deleting ``client``.

    Walks the reverse relations instead of naming apps or plugins, so a plugin
    that links to ``Client`` later (ticket_kpi does today) is covered without core
    importing it. A FK counts only when it is PROTECT; an M2M link always counts
    (Django cannot PROTECT an auto through table) unless it is in ``DELETABLE_LINKS``.
    """
    counts = {}
    for rel in client._meta.related_objects:
        name = rel.get_accessor_name()
        if rel.many_to_many:
            if name in DELETABLE_LINKS:
                continue
        elif not (rel.one_to_many and rel.on_delete is PROTECT):
            continue
        count = getattr(client, name).count()
        if count:
            counts[name] = count
    return counts


def archived_client_error(clients):
    """Message naming the inactive clients in ``clients``, or ``None`` when all are active.

    Callers pass only the clients being *added* to a record, so editing an old
    record that already points at an archived client is never blocked.
    """
    names = [client.name for client in clients if not client.is_active]
    if not names:
        return None
    return f'Cannot add records to archived client(s): {", ".join(names)}.'


def ensure_client_active(client):
    """Raise a (Django) ``ValidationError`` when ``client`` is archived.

    DRF turns it into a 400 inside ``validate_<field>`` methods.
    """
    message = archived_client_error([client])
    if message:
        raise ValidationError(message)


def cascade_record_counts(client):
    """``{accessor: count}`` of the records a delete would silently take with it
    (reverse CASCADE FKs, today the onboarding folders and documents)."""
    counts = {}
    for rel in client._meta.related_objects:
        if rel.one_to_many and rel.on_delete is CASCADE:
            name = rel.get_accessor_name()
            count = getattr(client, name).count()
            if count:
                counts[name] = count
    return counts


def last_activity(client):
    """Latest overtime or standby date recorded for ``client``, or ``None``."""
    dates = [
        getattr(client, accessor).aggregate(latest=Max('date'))['latest']
        for accessor in ('overtime_logs', 'standby_logs')
    ]
    dates = [d for d in dates if d]
    return max(dates) if dates else None


def delete_blockers(client):
    """Human-readable reasons ``client`` cannot be hard-deleted yet (empty = it can)."""
    blockers = []
    if client.is_active:
        blockers.append('Client must be archived before it can be deleted.')
    for name, count in protected_record_counts(client).items():
        blockers.append(f'Client still has records that must be kept: {name} ({count}).')
    for name, count in cascade_record_counts(client).items():
        blockers.append(f'Client still has onboarding data to purge first: {name} ({count}).')
    return blockers


def archive_client(client):
    """Deactivate ``client`` and unassign every user. Returns how many users were
    unassigned. Records and ticket-KPI links are deliberately left untouched:
    an export profile with no clients means "unrestricted", so clearing its link
    would widen access."""
    unassigned = client.assigned_users.count()
    client.assigned_users.clear()
    client.is_active = False
    client.save(update_fields=['is_active', 'updated_at'])
    return unassigned


def unarchive_client(client):
    """Reactivate ``client``. User assignments are not restored."""
    client.is_active = True
    client.save(update_fields=['is_active', 'updated_at'])


def record_client_event(request, client, action, operation, old=None, new=None, extra=None):
    """Write a client lifecycle event to the core audit log.

    ``action`` must be one of ``AuditLog.ACTION_CHOICES``; ``operation`` names the
    lifecycle step in ``extra_data``. A failed audit write never blocks the action.
    """
    try:
        from apps.reports.models import AuditLog
        from core.utils import get_client_ip

        AuditLog.objects.create(
            user=request.user,
            action=action,
            model_name='client',
            object_id=str(client.pk),
            object_repr=str(client)[:255],
            old_values=old,
            new_values=new,
            ip_address=get_client_ip(request) or None,
            user_agent=request.META.get('HTTP_USER_AGENT', '')[:500],
            extra_data={'operation': operation, **(extra or {})},
        )
    except Exception:
        logger.warning('Could not record client %s audit event for %s', operation, client.pk, exc_info=True)
