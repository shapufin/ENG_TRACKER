"""Daily housekeeping run by the scheduler (audit 2026-11-16 M9).

Each target is a no-argument callable. They wrap the existing management commands, so
the boot hook, a manual run and the scheduler all do exactly the same work.
"""
from django.core.management import call_command


def flush_expired_tokens():
    """Every login and refresh leaves an OutstandingToken row; expired ones are useless."""
    call_command('flushexpiredtokens')
