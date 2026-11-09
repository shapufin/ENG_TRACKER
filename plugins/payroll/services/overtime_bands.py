"""Pure band slicing for overtime pricing (no Django, no database).

An overtime entry is split at the band hours of its rule set and every slice
is priced ``1 + overtime + weekend/holiday + band`` premiums. A minute belongs
to the band its starting minute falls in; the night band wraps midnight.
"""
from dataclasses import dataclass
from datetime import time
from decimal import Decimal
from typing import Optional

DAY, EVENING, NIGHT = 'day', 'evening', 'night'
_BAND_ORDER = (DAY, EVENING, NIGHT)
_MINUTES_PER_DAY = 24 * 60


@dataclass(frozen=True)
class OvertimeBandRules:
    ot_premium: Decimal
    weekend_holiday_premium: Decimal
    evening_premium: Decimal
    night_premium: Decimal
    evening_start_hour: int = 19
    night_start_hour: int = 22
    night_end_hour: int = 6


@dataclass(frozen=True)
class BandSlice:
    code: str
    hours: Decimal
    multiplier: Decimal


def _band_of_hour(hour: int, rules: OvertimeBandRules) -> str:
    if hour >= rules.night_start_hour or hour < rules.night_end_hour:
        return NIGHT
    if hour >= rules.evening_start_hour:
        return EVENING
    return DAY


def _band_premium(band: str, rules: OvertimeBandRules) -> Decimal:
    return {
        DAY: Decimal('0'), EVENING: rules.evening_premium, NIGHT: rules.night_premium,
    }[band]


def _code(band: str, weekend_or_holiday: bool) -> str:
    return f"{'wh_' if weekend_or_holiday else ''}ot_{band}"


def _multiplier(band: str, weekend_or_holiday: bool, rules: OvertimeBandRules) -> Decimal:
    return (
        Decimal('1') + rules.ot_premium
        + (rules.weekend_holiday_premium if weekend_or_holiday else Decimal('0'))
        + _band_premium(band, rules)
    )


def _minutes_by_band(
    start: time, end: time, rules: OvertimeBandRules,
) -> dict[tuple[int, str], int]:
    """Clock minutes of ``[start, end)`` per (day offset, band).

    ``end <= start`` wraps past midnight; minutes after midnight belong to the
    next calendar day (offset 1) so a weekend/holiday flag can differ there.
    """
    begin = start.hour * 60 + start.minute
    finish = end.hour * 60 + end.minute
    if finish <= begin:
        finish += _MINUTES_PER_DAY
    minutes: dict[tuple[int, str], int] = {}
    for minute in range(begin, finish):
        key = (minute // _MINUTES_PER_DAY, _band_of_hour((minute // 60) % 24, rules))
        minutes[key] = minutes.get(key, 0) + 1
    return minutes


def slice_overtime_entry(
    hours: Decimal,
    start: Optional[time],
    end: Optional[time],
    weekend_or_holiday: bool,
    rules: OvertimeBandRules,
    next_day_weekend_or_holiday: Optional[bool] = None,
) -> tuple[list[BandSlice], list[str]]:
    """Split one entry into priced band slices; returns ``(slices, warnings)``.

    ``hours`` is the persisted paid share and is distributed over the bands
    pro-rata by clock minutes; the last slice takes the remainder so the
    slice hours always sum to ``hours``. Minutes after midnight use
    ``next_day_weekend_or_holiday`` (default: same as the start day), so a
    Saturday 22:00-04:00 shift is weekday pay until midnight and Sunday pay
    after it. Without both timestamps the whole entry is priced in the day
    band and a warning is returned (bands are never guessed).
    """
    if start is None or end is None:
        return (
            [BandSlice(_code(DAY, weekend_or_holiday), hours,
                       _multiplier(DAY, weekend_or_holiday, rules))],
            ['Overtime entry is missing a start/end time; priced in the day band.'],
        )
    if next_day_weekend_or_holiday is None:
        next_day_weekend_or_holiday = weekend_or_holiday
    raw = _minutes_by_band(start, end, rules)
    flags = (weekend_or_holiday, next_day_weekend_or_holiday)
    by_code: dict[str, tuple[Decimal, int]] = {}
    for offset in (0, 1):
        for band in _BAND_ORDER:
            if not raw.get((offset, band)):
                continue
            code = _code(band, flags[offset])
            multiplier, minutes = by_code.get(code, (_multiplier(band, flags[offset], rules), 0))
            by_code[code] = (multiplier, minutes + raw[(offset, band)])
    total = sum(minutes for _, minutes in by_code.values())
    slices: list[BandSlice] = []
    assigned = Decimal('0')
    last = len(by_code) - 1
    for index, (code, (multiplier, minutes)) in enumerate(by_code.items()):
        if index == last:
            share = hours - assigned
        else:
            share = hours * minutes / total
            assigned += share
        slices.append(BandSlice(code, share, multiplier))
    return slices, []
