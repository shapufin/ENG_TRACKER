"""Hours as text for CSV exports."""


def format_hours(value) -> str:
    """Whole hours without a decimal point, fractions kept: 4 -> '4', 0.5 -> '0.5'.

    Matches JS ``String(Number(value))`` so server and client exports agree.
    """
    if value is None:
        return '0'
    hours = float(value)
    return str(int(hours)) if hours == int(hours) else str(hours)
