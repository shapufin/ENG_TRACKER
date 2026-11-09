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
    evening_start_hour: int = 18
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


def _minutes_by_band(start: time, end: time, rules: OvertimeBandRules) -> dict[str, int]:
    """Clock minutes of ``[start, end)`` per band; ``end <= start`` wraps a day."""
    begin = start.hour * 60 + start.minute
    finish = end.hour * 60 + end.minute
    if finish <= begin:
        finish += _MINUTES_PER_DAY
    minutes = {DAY: 0, EVENING: 0, NIGHT: 0}
    for minute in range(begin, finish):
        minutes[_band_of_hour((minute // 60) % 24, rules)] += 1
    return minutes


def slice_overtime_entry(
    hours: Decimal,
    start: Optional[time],
    end: Optional[time],
    weekend_or_holiday: bool,
    rules: OvertimeBandRules,
) -> tuple[list[BandSlice], list[str]]:
    """Split one entry into priced band slices; returns ``(slices, warnings)``.

    ``hours`` is the persisted paid share and is distributed over the bands
    pro-rata by clock minutes; the last slice takes the remainder so the
    slice hours always sum to ``hours``. Without both timestamps the whole
    entry is priced in the day band and a warning is returned (bands are
    never guessed).
    """
    if start is None or end is None:
        return (
            [BandSlice(_code(DAY, weekend_or_holiday), hours,
                       _multiplier(DAY, weekend_or_holiday, rules))],
            ['Overtime entry is missing a start/end time; priced in the day band.'],
        )
    minutes = _minutes_by_band(start, end, rules)
    total = sum(minutes.values())
    used = [band for band in _BAND_ORDER if minutes[band]]
    slices: list[BandSlice] = []
    assigned = Decimal('0')
    for band in used:
        if band == used[-1]:
            share = hours - assigned
        else:
            share = hours * minutes[band] / total
            assigned += share
        slices.append(BandSlice(
            _code(band, weekend_or_holiday), share,
            _multiplier(band, weekend_or_holiday, rules),
        ))
    return slices, []
