"""Ticket reference normalization for KPI/overtime matching."""

import re

from apps.overtime.models.core import normalize_ticket_reference


# One normalizer for structured refs (core) and imported ticket ids (KPI).
normalize_ticket_id = normalize_ticket_reference


def evidence_tokens(raw: str) -> list[str]:
    """Return normalized whitespace/comma/semicolon-delimited evidence tokens."""
    return [
        normalize_ticket_id(token)
        for token in re.split(r'[\s,;]+', raw or '')
        if token.strip()
    ]
