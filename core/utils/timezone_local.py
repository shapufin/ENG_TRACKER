"""Albania's local calendar date (Europe/Tirane).

Django's TIME_ZONE is UTC, so `date.today()` and `timezone.localdate()` return
the previous day for the first hours of each Tirane day. Any business decision
that depends on the company's calendar day (month defaults, SLA deadlines)
must use this helper instead.
"""
from datetime import datetime
from zoneinfo import ZoneInfo

TIRANA = ZoneInfo('Europe/Tirane')  # canonical IANA name for Albania (tzdata pinned in requirements.txt)


def tirana_today():
    return datetime.now(TIRANA).date()
