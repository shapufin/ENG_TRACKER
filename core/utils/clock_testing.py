"""Test helper: pin the business calendar day (see ``timezone_local.business_today``)."""
from datetime import datetime, time
from unittest import mock

from core.utils import timezone_local


def freeze_business_today(day):
    """Patch the clock so ``business_today()`` returns ``day`` (noon, business zone).

    Returns a started patcher; callers stop it (``addCleanup(p.stop)``).
    """
    fake = mock.MagicMock(wraps=datetime)
    fake.now.side_effect = lambda tz=None: datetime.combine(day, time(12), tzinfo=tz)
    patcher = mock.patch.object(timezone_local, 'datetime', fake)
    patcher.start()
    return patcher
