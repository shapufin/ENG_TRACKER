"""
Deadline rules for TL engagement scoring.

- Leave: decided by the end of the same working day it was submitted. A request
  submitted on a weekend or public holiday is due at the end of the next
  working day.
- Overtime / standby: decided within 5 working days after the submission date.
- Working day = Mon-Fri, not a public holiday in the TL's holiday set.
- Deadlines are end-of-day in Europe/Tirana (the company's local time), so the
  Django TIME_ZONE setting (UTC) is deliberately not used here.

Pure functions only: no database access. The services layer loads holidays.
"""
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

TIRANA = ZoneInfo('Europe/Tirane')  # canonical IANA name for Albania (tzdata 2026.2 pinned in requirements.txt)
SLA_WORKING_DAYS = {'overtime': 5, 'standby': 5}
RESPONSIVENESS_FULL_CREDIT = 0.25
RESPONSIVENESS_ZERO_CREDIT = 1.0


def today_local():
    return datetime.now(TIRANA).date()


def is_working_day(day, holidays):
    return day.weekday() < 5 and day not in holidays


def deadline_for(type_key, submitted_at, holidays):
    """End-of-day (Tirana) instant by which a request of ``type_key`` must be decided."""
    day = submitted_at.astimezone(TIRANA).date()
    if type_key == 'leave':
        while not is_working_day(day, holidays):
            day += timedelta(days=1)
    else:
        remaining = SLA_WORKING_DAYS[type_key]
        while remaining:
            day += timedelta(days=1)
            if is_working_day(day, holidays):
                remaining -= 1
    return datetime.combine(day, time.max, tzinfo=TIRANA)


def responsiveness_score(median_fraction):
    """0-100 from the median share of the deadline window used to decide.

    Full credit when the median decision lands in the first quarter of the
    window, falling linearly to zero at the deadline itself.
    """
    if median_fraction is None:
        return None
    if median_fraction <= RESPONSIVENESS_FULL_CREDIT:
        return 100.0
    if median_fraction >= RESPONSIVENESS_ZERO_CREDIT:
        return 0.0
    span = RESPONSIVENESS_ZERO_CREDIT - RESPONSIVENESS_FULL_CREDIT
    return round(100 * (1 - (median_fraction - RESPONSIVENESS_FULL_CREDIT) / span), 2)
