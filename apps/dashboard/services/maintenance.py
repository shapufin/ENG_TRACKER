"""Maintenance mode read/write service.

The view stays thin; all state transitions and the public payload shape live
here so the admin tab, the public status endpoint and the audit trail cannot
drift apart.
"""

from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.reports.services.security_audit import log_security_event
from core.maintenance import clear_maintenance_cache, get_maintenance_state
from core.utils import get_client_ip

from ..models import MaintenanceState


def status_payload(request=None) -> dict:
    """Public payload: effective state + branding, no PII.

    Branding comes from the cached state (a branding write clears it), so a
    warm status GET costs zero queries. The logo path is turned into an
    absolute URL per request, like ``SiteBrandingSerializer``.
    """
    state = get_maintenance_state()
    logo_url = state['logo_path']
    if logo_url and request is not None:
        logo_url = request.build_absolute_uri(logo_url)
    return {
        'active': state['active'],
        'title': state['title'],
        'message': state['message'],
        'started_at': state['started_at'],
        'ends_at': state['ends_at'],
        'updated_at': state['updated_at'],
        'site_name': state['site_name'],
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

    # A pre-staged past end must not arm a switch that expires instantly: the
    # self-heal would turn it off on the very next read and the admin would see
    # nothing happen. The serializer can only validate an ends_at that rides in
    # the same payload, so the effective window is checked here.
    if state.is_active and state.ends_at is not None and state.ends_at <= timezone.now():
        raise ValidationError({'ends_at': 'The expected end must be in the future.'})

    if state.is_active:
        if not previous_active or state.started_at is None:
            state.started_at = timezone.now()
    elif previous_active:
        # Only a real off-transition clears the window: a copy edit while off
        # must preserve a pre-staged ends_at for the next activation.
        state.started_at = None
        state.ends_at = None

    state.updated_by = actor if getattr(actor, 'is_authenticated', False) else None
    state.save()
    clear_maintenance_cache()

    if state.is_active != previous_active:
        _log(actor, request, 'MAINTENANCE_ON' if state.is_active else 'MAINTENANCE_OFF', state)

    return status_payload(request)
