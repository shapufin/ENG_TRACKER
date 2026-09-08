from django.utils import timezone
from django.db import models
import logging

logger = logging.getLogger(__name__)


def record_metric(metric_type, value, user=None, team=None, label='', metadata=None):
    """
    Record an analytics metric.
    """
    from .models import AnalyticsMetric
    
    try:
        AnalyticsMetric.objects.create(
            metric_type=metric_type,
            user=user,
            team=team,
            value=value,
            label=label,
            metadata=metadata or {}
        )
    except Exception as e:
        logger.error(f"Failed to record metric {metric_type}: {str(e)}")


def generate_snapshot(snapshot_type='daily'):
    """
    Generate an analytics snapshot.
    """
    from .models import AnalyticsSnapshot
    from apps.leave_management.models import LeaveRequest
    from apps.overtime.models import OvertimeLog
    from apps.standby.models import StandbyLog
    
    try:
        now = timezone.now().date()
        
        # Leave metrics
        leave_requests = LeaveRequest.objects.all()
        leave_approved = leave_requests.filter(status='approved').count()
        leave_pending = leave_requests.filter(status='pending').count()
        leave_rejected = leave_requests.filter(status='rejected').count()
        # Calculate leave days by summing the days_requested property
        # Note: This is a Python-level aggregation since days_requested is a computed property
        # For large datasets, consider denormalizing this to a database field
        approved_requests = leave_requests.filter(status='approved')
        leave_days = sum(lr.days_requested for lr in approved_requests)
        
        # Overtime metrics
        overtime_logs = OvertimeLog.objects.all()
        overtime_approved = float(overtime_logs.filter(status='approved').aggregate(
            total=models.Sum('hours')
        )['total'] or 0)
        overtime_pending = float(overtime_logs.filter(status='pending').aggregate(
            total=models.Sum('hours')
        )['total'] or 0)

        # Standby metrics (map pending→scheduled, approved→completed for Analytics compatibility)
        standby_logs = StandbyLog.objects.all()
        standby_scheduled = standby_logs.filter(status='pending').count()
        standby_completed = standby_logs.filter(status='approved').count()
        
        # Create snapshot
        snapshot, created = AnalyticsSnapshot.objects.update_or_create(
            snapshot_type=snapshot_type,
            snapshot_date=now,
            defaults={
                'leave_approved_count': leave_approved,
                'leave_pending_count': leave_pending,
                'leave_rejected_count': leave_rejected,
                'leave_total_days': leave_days,
                'overtime_approved_hours': overtime_approved,
                'overtime_pending_hours': overtime_pending,
                'standby_scheduled_count': standby_scheduled,
                'standby_completed_count': standby_completed,
            }
        )
        
        logger.info(f"Analytics snapshot generated: {snapshot_type} - {now}")
        return snapshot
    except Exception as e:
        logger.error(f"Failed to generate snapshot: {str(e)}")
        return None
