"""
Audit logging signals for automatic change tracking.
Connects to overtime, standby, and leave management models.
"""

from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.contrib.contenttypes.models import ContentType

from .models import AuditLog
from apps.overtime.models import OvertimeLog
from apps.standby.models import StandbyLog
from apps.leave_management.models import LeaveRequest
from core.middleware.user_context import get_current_user


# Map models to their audit names
MODEL_MAP = {
    'overtimelog': OvertimeLog,
    'standbylog': StandbyLog,
    'leaverequest': LeaveRequest,
}


def get_model_name(instance):
    """Get the audit model name for an instance."""
    ct = ContentType.objects.get_for_model(instance)
    return f"{ct.app_label}{ct.model}"


def get_object_repr(instance):
    """Get a string representation of an object."""
    if hasattr(instance, 'user'):
        user = getattr(instance.user, 'get_full_name', lambda: instance.user.username)()
        return f"{user} - {instance.__class__.__name__} #{instance.id}"
    return f"{instance.__class__.__name__} #{instance.id}"


def log_change(sender, instance, created, action_override=None, **kwargs):
    """Log a change to the audit trail."""
    import logging
    logger = logging.getLogger(__name__)

    model_name = None
    for name, model in MODEL_MAP.items():
        if isinstance(instance, model):
            model_name = name
            break

    if not model_name:
        return

    action = 'CREATE' if created else (action_override or 'UPDATE')

    # Get current user from middleware context
    user = get_current_user()

    # Gracefully handle case where AuditLog table doesn't exist yet
    try:
        AuditLog.objects.create(
            user=user if user and user.is_authenticated else None,
            action=action,
            model_name=model_name,
            object_id=str(instance.id),
            object_repr=get_object_repr(instance),
            old_values=None,  # Would need to fetch previous state for true diff
            new_values={
                'status': getattr(instance, 'status', None),
                'date': str(getattr(instance, 'date', '')),
                'hours': str(getattr(instance, 'hours', '')),
                'user_id': getattr(getattr(instance, 'user', None), 'id', None),
            },
            extra_data={'source': 'signal'}
        )
    except Exception as e:
        # Log the error but don't break the main transaction
        logger.error(f"Failed to log audit action for {model_name} {instance.id}: {e}", exc_info=True)


@receiver(
    post_save,
    sender=OvertimeLog,
    dispatch_uid='reports.log_overtime_change',
)
def log_overtime_change(sender, instance, created, **kwargs):
    """Log overtime changes."""
    log_change(sender, instance, created, **kwargs)


@receiver(
    post_save,
    sender=StandbyLog,
    dispatch_uid='reports.log_standby_change',
)
def log_standby_change(sender, instance, created, **kwargs):
    """Log standby changes."""
    log_change(sender, instance, created, **kwargs)


@receiver(
    post_save,
    sender=LeaveRequest,
    dispatch_uid='reports.log_leave_change',
)
def log_leave_change(sender, instance, created, **kwargs):
    """Log leave request changes."""
    log_change(sender, instance, created, **kwargs)


@receiver(
    post_delete,
    sender=OvertimeLog,
    dispatch_uid='reports.log_overtime_delete',
)
@receiver(
    post_delete,
    sender=StandbyLog,
    dispatch_uid='reports.log_standby_delete',
)
@receiver(
    post_delete,
    sender=LeaveRequest,
    dispatch_uid='reports.log_leave_delete',
)
def log_deletion(sender, instance, **kwargs):
    """Log deletions."""
    import logging
    logger = logging.getLogger(__name__)

    model_name = None
    for name, model in MODEL_MAP.items():
        if isinstance(instance, model):
            model_name = name
            break

    if not model_name:
        return

    # Get current user from middleware context
    user = get_current_user()

    # Gracefully handle case where AuditLog table doesn't exist yet
    try:
        AuditLog.objects.create(
            user=user if user and user.is_authenticated else None,
            action='DELETE',
            model_name=model_name,
            object_id=str(instance.id),
            object_repr=get_object_repr(instance),
            old_values={'status': getattr(instance, 'status', None)},
            new_values=None,
            extra_data={'source': 'signal'}
        )
    except Exception as e:
        # Log the error but don't break the main transaction
        logger.error(f"Failed to log audit deletion for {model_name} {instance.id}: {e}", exc_info=True)
