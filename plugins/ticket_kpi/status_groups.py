"""One place that decides which KPI group a ticket status belongs to.

Statuses reach the database in whatever wording the source system used (the
importer only rewrites the few it knows). Analytics must not depend on that
wording, so it groups the stored value here: open, closed, cancelled or other.
"""

CLOSED_WORDS = frozenset({
    'closed', 'closed complete', 'closed incomplete', 'resolved', 'done',
    'complete', 'completed', 'solved', 'fulfilled', 'finished', 'delivered',
})
OPEN_WORDS = frozenset({
    'open', 'new', 'in progress', 'on hold', 'pending', 'reopened', 'assigned',
    'work in progress', 'awaiting info', 'awaiting user', 'awaiting vendor',
    'awaiting assignment', 'active', 'to do', 'todo', 'in review',
})
CANCELLED_WORDS = frozenset({'cancelled', 'canceled', 'withdrawn'})


def status_group(value) -> str:
    """Return 'closed', 'open', 'cancelled' or 'other' for a stored status."""
    word = str(value or '').strip().lower()
    if word in CLOSED_WORDS:
        return 'closed'
    if word in OPEN_WORDS:
        return 'open'
    if word in CANCELLED_WORDS:
        return 'cancelled'
    return 'other'
