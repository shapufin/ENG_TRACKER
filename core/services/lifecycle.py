"""Audit trail for archive / unarchive / delete style lifecycle steps."""
import logging

logger = logging.getLogger(__name__)


def record_lifecycle_event(request, obj, model_name, action, operation, old=None, new=None, extra=None, actor=None):
    """Write a lifecycle event to the core audit log.

    ``action`` must be one of ``AuditLog.ACTION_CHOICES``; ``operation`` names the
    step in ``extra_data``. A failed audit write never blocks the action.
    ``request`` may be ``None`` (imports, services): then ``actor`` is the user, if known.
    """
    try:
        from apps.reports.models import AuditLog
        from core.utils import get_client_ip

        AuditLog.objects.create(
            user=actor or (request.user if request is not None else None),
            action=action,
            model_name=model_name,
            object_id=str(obj.pk),
            object_repr=str(obj)[:255],
            old_values=old,
            new_values=new,
            ip_address=(get_client_ip(request) or None) if request is not None else None,
            user_agent=request.META.get('HTTP_USER_AGENT', '')[:500] if request is not None else '',
            extra_data={'operation': operation, **(extra or {})},
        )
    except Exception:
        logger.warning('Could not record %s %s audit event for %s', model_name, operation, obj.pk, exc_info=True)
