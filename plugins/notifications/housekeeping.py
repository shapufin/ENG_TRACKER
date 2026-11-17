"""Daily retention jobs of the notifications plugin (audit 2026-11-16 M9)."""
from django.core.management import call_command

from plugins.notifications.idempotency import purge_old_idempotency_records


def prune():
    """Delete read notifications past retention, and old idempotency records."""
    call_command('prune_notifications', verbosity=0)
    purge_old_idempotency_records()
