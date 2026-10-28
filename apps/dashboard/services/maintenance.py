"""Maintenance mode read/write service.

The view stays thin; all state transitions and the public payload shape live
here so the admin tab, the public status endpoint and the audit trail cannot
drift apart.
"""

from django.utils import timezone

from apps.reports.services.security_audit import log_security_event
from core.maintenance import clear_maintenance_cache, get_maintenance_state
from core.utils import get_client_ip

from ..models import MaintenanceState, SiteBranding


def _branding(request=None) -> tuple[str, str | None]:
    """Site name + logo for the maintenance screen. Never creates the row."""
    branding = SiteBranding.objects.first()
    if branding is None:
        return 'Engineering Tracker', None
    if not branding.logo:
        return branding.site_name, None
    # Absolute, like SiteBrandingSerializer: the SPA and the API are separate
    # origins in dev, and the maintenance screen must render the logo offline
    # from any route.
    url = branding.logo.url
    return branding.site_name, request.build_absolute_uri(url) if request else url


def status_payload(request=None) -> dict:
    """Public payload: effective state + branding, no PII."""
    state = get_maintenance_state()
    site_name, logo_url = _branding(request)
    return {
        'active': state['active'],
        'title': state['title'],
        'message': state['message'],
        'started_at': state['started_at'],
        'ends_at': state['ends_at'],
        'updated_at': state['updated_at'],
        'site_name': site_name,
        'logo_url': logo_url,
    }


def _log(actor, request, action: str, state: MaintenanceState) -> None:
    log_security_event(
        user=actor,
        action=action,
        description=(
            f"Maintenance mode {'enabled' if action == 'MAINTENANCE_ON' else 'disabled'} "
            f"by {getattr(actor, 'username', 'unknown')}"
        ),
        ip_address=get_client_ip(request),
        user_agent=request.META.get('HTTP_USER_AGENT', ''),
        extra_data={
            'ends_at': state.ends_at.isoformat() if state.ends_at else None,
            'title': state.title,
        },
    )


def apply_update(data: dict, actor, request) -> dict:
    """Apply a staff PATCH and return the new public payload.

    Turning off clears the window (``started_at``/``ends_at``) so the next
    activation starts clean. Turning on stamps ``started_at`` once, so editing
    the copy of an active window does not restart the clock.
    """
    state, _ = MaintenanceState.objects.get_or_create(pk=1)
    previous_active = state.is_active

    for field in ('title', 'message', 'ends_at'):
        if field in data:
            setattr(state, field, data[field])

    if 'is_active' in data:
        state.is_active = bool(data['is_active'])

    if state.is_active:
        if not previous_active or state.started_at is None:
            state.started_at = timezone.now()
    else:
        state.started_at = None
        state.ends_at = None

    state.updated_by = actor if getattr(actor, 'is_authenticated', False) else None
    state.save()
    clear_maintenance_cache()

    if state.is_active != previous_active:
        _log(actor, request, 'MAINTENANCE_ON' if state.is_active else 'MAINTENANCE_OFF', state)

    return status_payload(request)
