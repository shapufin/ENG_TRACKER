"""Spreadsheet-formula neutralisation for CSV exports."""

_FORMULA_TRIGGERS = ("=", "+", "-", "@", "\t", "\r")


def csv_safe(value):
    """Return a value safe to write into a CSV cell.

    Free text whose first non-space character is ``= + - @``, tab or CR is
    prefixed with ``'`` so Excel/Sheets treat it as text, not a formula. Only
    ``str`` is touched: numbers (a legitimate ``-5``) pass through, ``None``
    becomes an empty cell. Mirrors plugins/tl_scorecard/csv_export._cell, which
    core must not import.
    """
    if value is None:
        return ""
    if isinstance(value, str) and value.lstrip(" ").startswith(_FORMULA_TRIGGERS):
        return f"'{value}"
    return value
