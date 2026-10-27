"""Count the records that point at an instance, by relation, for delete/archive checks."""


def relation_counts(instance, include):
    """``{accessor: count}`` for the reverse relations ``include(rel)`` selects.

    Walks ``_meta.related_objects`` instead of naming apps or plugins, so a plugin
    that links to the model later is covered without core importing it. Relations
    with no rows are left out.
    """
    counts = {}
    for rel in instance._meta.related_objects:
        if not include(rel):
            continue
        name = rel.get_accessor_name()
        if name is None:  # hidden relation (related_name='+'); nothing to count
            continue
        count = getattr(instance, name).count()
        if count:
            counts[name] = count
    return counts
