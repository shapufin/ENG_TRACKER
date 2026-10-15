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


def xlsx_safe(value):
    """Like ``csv_safe`` for a spreadsheet cell, but ``None`` stays ``None``.

    openpyxl/xlsxwriter store a string starting with ``=`` as a formula, so the
    same ``'`` prefix applies. Dates and numbers pass through untouched.
    """
    if value is None:
        return None
    return csv_safe(value)


def xlsx_safe_row(row):
    """Neutralise every cell of a row before ``ws.append(row)``."""
    return [xlsx_safe(v) for v in row]
