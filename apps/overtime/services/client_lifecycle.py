"""Rules for what must survive a client delete (plan A1, client archive)."""
from django.db.models import PROTECT

# Reverse M2M links a delete may drop: user assignments are cleared when a
# client is archived, so they never need to block anything.
DELETABLE_LINKS = frozenset({'assigned_users'})


def protected_record_counts(client):
    """``{accessor: count}`` of the records that block deleting ``client``.

    Walks the reverse relations instead of naming apps or plugins, so a plugin
    that links to ``Client`` later (ticket_kpi does today) is covered without core
    importing it. A FK counts only when it is PROTECT; an M2M link always counts
    (Django cannot PROTECT an auto through table) unless it is in ``DELETABLE_LINKS``.
    """
    counts = {}
    for rel in client._meta.related_objects:
        name = rel.get_accessor_name()
        if rel.many_to_many:
            if name in DELETABLE_LINKS:
                continue
        elif not (rel.one_to_many and rel.on_delete is PROTECT):
            continue
        count = getattr(client, name).count()
        if count:
            counts[name] = count
    return counts
