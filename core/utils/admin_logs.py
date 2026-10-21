"""Server-side search, date range and status counts for the admin Hours Logs lists.

The admin overtime/standby pages page on the server, so a growing history never
has to be loaded into the browser.
"""
from django.db.models import Count, Q


def filter_admin_logs(queryset, params, search_fields):
    """Apply search / date_from / date_to; order newest first.

    Every whitespace-separated search term must match at least one of
    ``search_fields`` (so "Anna Zogaj" finds Anna Zogaj by full name).
    """
    for term in (params.get('search') or '').split():
        match = Q()
        for field in search_fields:
            match |= Q(**{f'{field}__icontains': term})
        queryset = queryset.filter(match)
    if params.get('date_from'):
        queryset = queryset.filter(date__gte=params['date_from'])
    if params.get('date_to'):
        queryset = queryset.filter(date__lte=params['date_to'])
    return queryset.order_by('-date', '-id')


def status_counts(queryset):
    """Counts per status for ``queryset`` (before any status filter is applied)."""
    return queryset.aggregate(
        total=Count('id'),
        pending=Count('id', filter=Q(status='pending')),
        approved=Count('id', filter=Q(status='approved')),
        rejected=Count('id', filter=Q(status='rejected')),
    )
