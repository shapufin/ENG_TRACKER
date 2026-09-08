"""Shared utility helpers for the Engineering Tracker."""
from __future__ import annotations

from django.http import HttpRequest


def get_client_ip(request: HttpRequest) -> str:
    """Return the real client IP, accounting for the nginx proxy (P1-9).

    nginx overwrites ``X-Forwarded-For`` with ``$remote_addr`` (the real
    client IP), so the last entry in the XFF header is the trusted value.
    Falls back to ``REMOTE_ADDR`` when no XFF header is present (direct
    access, dev, or health probes).

    Use this for audit logging and any IP-based attribution. DRF throttle
    resolution uses ``NUM_PROXIES`` independently — this helper is for
    application-level IP capture only.
    """
    xff = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if xff:
        # Take the last entry — the one appended by our trusted nginx.
        return xff.split(',')[-1].strip()
    return request.META.get('REMOTE_ADDR', '')
