"""Ticket reference normalization for KPI/overtime matching."""

import re


_PREFIX_RE = re.compile(r'^(?:inc|ticket|t|#)\s*-?\s*', re.IGNORECASE)
_SPACE_RE = re.compile(r'\s+')


def normalize_ticket_id(raw: str) -> str:
    """Normalize one ticket reference without turning substrings into matches."""
    value = str(raw or '').strip().lower()
    value = _PREFIX_RE.sub('', value)
    return _SPACE_RE.sub('', value)


def evidence_tokens(raw: str) -> list[str]:
    """Return normalized whitespace/comma/semicolon-delimited evidence tokens."""
    return [
        normalize_ticket_id(token)
        for token in re.split(r'[\s,;]+', raw or '')
        if token.strip()
    ]
