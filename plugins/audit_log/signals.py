from django.utils import timezone
import logging

logger = logging.getLogger(__name__)


def log_action(user, action, description='', obj=None, old_values=None, new_values=None, 
               ip_address=None, user_agent=None, status='success'):
    """
    Log an action to the audit log.
    """
    from .models import AuditLog
    from django.contrib.contenttypes.models import ContentType
    
    try:
        content_type = None
        object_id = None
        
        if obj:
            content_type = ContentType.objects.get_for_model(obj)
            object_id = obj.pk
        
        AuditLog.objects.create(
            user=user,
            action=action,
            description=description,
            content_type=content_type,
            object_id=object_id,
            old_values=old_values or {},
            new_values=new_values or {},
            ip_address=ip_address,
            user_agent=user_agent or '',
            status=status,
        )
    except Exception as e:
        logger.error(f"Failed to log action: {str(e)}")


def cleanup_old_logs(retention_days=365):
    """
    Delete audit logs older than retention period.
    """
    from .models import AuditLog
    
    try:
        cutoff_date = timezone.now() - timezone.timedelta(days=retention_days)
        deleted_count, _ = AuditLog.objects.filter(timestamp__lt=cutoff_date).delete()
        logger.info(f"Cleaned up {deleted_count} old audit logs")
        return deleted_count
    except Exception as e:
        logger.error(f"Failed to cleanup audit logs: {str(e)}")
        return 0
