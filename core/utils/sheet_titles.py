"""Excel sheet titles that never crash the workbook or collide.

openpyxl raises on titles longer than 31 characters or containing any of
``[]:*?/\\``, and silently overwrites a sheet when the same title is created
twice. Every place that derives a sheet name from user data (a TL's name, a
team code) must go through ``safe_sheet_title``.
"""

INVALID_CHARS = set('[]:*?/\\')
MAX_TITLE_LENGTH = 31
FALLBACK_TITLE = 'Sheet'


def safe_sheet_title(name: str, used: set[str] | None = None) -> str:
    """Return a legal, unique sheet title for ``name``.

    ``used`` is the set of titles already taken in the workbook; the returned
    title is added to it, so callers can pass the same set for every sheet.
    """
    cleaned = ''.join(char for char in str(name or '') if char not in INVALID_CHARS)
    cleaned = cleaned.strip() or FALLBACK_TITLE
    title = cleaned[:MAX_TITLE_LENGTH]

    if used is None:
        return title

    if title not in used:
        used.add(title)
        return title

    # Disambiguate inside the 31-character budget: "Name (2)" keeps the stem.
    for index in range(2, 1000):
        suffix = f' ({index})'
        stem = cleaned[: MAX_TITLE_LENGTH - len(suffix)].rstrip()
        candidate = f'{stem}{suffix}'
        if candidate not in used:
            used.add(candidate)
            return candidate

    # 999 sheets with the same name cannot happen in practice; keep it legal.
    fallback = f'Sheet {len(used) + 1}'[:MAX_TITLE_LENGTH]
    used.add(fallback)
    return fallback
