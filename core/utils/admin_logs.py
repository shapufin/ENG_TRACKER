"""Server-side search, date range and status counts for the admin Hours Logs lists.

The admin overtime/standby pages page on the server, so a growing history never
has to be loaded into the browser.
"""
from datetime import date

from django.db.models import Count, Q
from rest_framework.exceptions import ValidationError

MAX_SEARCH_TERMS = 5
MAX_SEARCH_LENGTH = 100


def search_terms(value):
    """Whitespace-split search terms, capped so one request cannot chain hundreds of LIKE clauses."""
    return (value or '')[:MAX_SEARCH_LENGTH].split()[:MAX_SEARCH_TERMS]


def parse_iso_date(value, name):
    """An ISO ``YYYY-MM-DD`` filter value, or a 400 (an unparsed value would be a 500 in the ORM)."""
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ValidationError({name: 'Enter a valid date (YYYY-MM-DD).'})


def filter_admin_logs(queryset, params, search_fields):
    """Apply search / date_from / date_to; order newest first.

    Every whitespace-separated search term must match at least one of
    ``search_fields`` (so "Anna Zogaj" finds Anna Zogaj by full name).
    """
    for term in search_terms(params.get('search')):
        match = Q()
        for field in search_fields:
            match |= Q(**{f'{field}__icontains': term})
        queryset = queryset.filter(match)
    if params.get('date_from'):
        queryset = queryset.filter(date__gte=parse_iso_date(params['date_from'], 'date_from'))
    if params.get('date_to'):
        queryset = queryset.filter(date__lte=parse_iso_date(params['date_to'], 'date_to'))
    return queryset.order_by('-date', '-id')


def status_counts(queryset):
    """Counts per status for ``queryset`` (before any status filter is applied)."""
    return queryset.aggregate(
        total=Count('id'),
        pending=Count('id', filter=Q(status='pending')),
        approved=Count('id', filter=Q(status='approved')),
        rejected=Count('id', filter=Q(status='rejected')),
    )
