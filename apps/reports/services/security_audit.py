"""
Security and authentication audit logging service.
Dual-writes security events to core AuditLog and the audit_log plugin (if enabled)
without bloating the database on high-frequency token refreshes.
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)


def log_security_event(
    user=None,
    action: str = 'LOGIN_FAILED',
    description: str = '',
    ip_address: str | None = None,
    user_agent: str | None = None,
    extra_data: dict[str, Any] | None = None,
    status: str = 'success',
) -> None:
    """Record a security/authentication event to core AuditLog and plugin audit log.

    Guarded with try-except to ensure authentication flows never fail due to
    logging errors.
    """
    action_upper = action.upper()
    action_lower = action.lower()

    # 1. Write to apps.reports.models.AuditLog (powers the Admin UI Audit Logs page)
    try:
        from apps.reports.models import AuditLog

        username = (
            user.username
            if user and getattr(user, 'username', None)
            else (extra_data.get('username') if extra_data else None)
            or 'Anonymous'
        )

        AuditLog.objects.create(
            user=user if user and getattr(user, 'is_authenticated', False) else None,
            action=action_upper,
            model_name='auth',
            object_id=str(user.id) if user and getattr(user, 'id', None) else '0',
            object_repr=str(username)[:255],
            old_values=None,
            new_values=None,
            ip_address=ip_address,
            user_agent=(user_agent or '')[:500],
            extra_data=dict(
                extra_data or {},
                description=description,
                status=status,
            ),
        )
    except Exception as exc:
        logger.warning(f"Failed to record core audit log for security event {action}: {exc}")

    # 2. Dual-write to plugins.audit_log if installed and active
    try:
        from plugins.audit_log.signals import log_action

        log_action(
            user=user if user and getattr(user, 'is_authenticated', False) else None,
            action=action_lower,
            description=description,
            obj=user if user and getattr(user, 'id', None) else None,
            ip_address=ip_address,
            user_agent=(user_agent or '')[:500],
            status=status,
        )
    except Exception:
        # Plugin is optional; fail-closed on import or disabled plugin
        pass
