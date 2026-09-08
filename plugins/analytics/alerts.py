from django.utils import timezone
from .models import AnalyticsConfiguration
from .core_provider import CoreAnalyticsProvider
from apps.leave_management.models import LeaveRequest
from datetime import timedelta
import logging

logger = logging.getLogger(__name__)

class AnalyticsAlertService:
    """
    Service for checking analytics thresholds and sending alerts.
    """
    @classmethod
    def check_thresholds(cls):
        config = AnalyticsConfiguration.objects.first()
        if not config or not config.enable_threshold_alerts:
            return

        now = timezone.now()

        # Check MTTA
        provider = CoreAnalyticsProvider()
        mtta_leave = provider._calculate_mtta(LeaveRequest, now - timedelta(days=30))
        if mtta_leave > config.mtta_threshold_hours:
            cls._send_alert(
                f"MTTA Alert: {mtta_leave:.1f} hours",
                f"Mean Time to Approval for leave requests ({mtta_leave:.1f}h) has exceeded the threshold of {config.mtta_threshold_hours}h.",
                config.alert_recipients
            )

    @classmethod
    def _send_alert(cls, subject, body, recipient_ids):
        """
        Send an analytics threshold alert.

        Email delivery was previously handled by the email_notifications
        plugin, which has been removed. Alerts are now logged only; wire
        this up to a different transport (e.g. django.core.mail) if outbound
        alerting is needed.
        """
        from django.contrib.auth.models import User

        recipients = User.objects.filter(id__in=recipient_ids)
        recipient_names = ", ".join(u.username for u in recipients)
        logger.warning(
            "Analytics threshold alert (no email transport configured): "
            "subject=%s recipients=%s", subject, recipient_names
        )
