"""Shared DRF pagination classes."""

from rest_framework.pagination import PageNumberPagination


class StandardResultsPagination(PageNumberPagination):
    """PageNumberPagination with a client-overridable ``page_size``.

    The global ``REST_FRAMEWORK`` config sets ``PAGE_SIZE=50`` but does not
    set ``page_size_query_param``, so viewsets that inherit the default
    paginator silently ignore ``?page_size=`` from the client. Resource-access
    directory and member lists send ``page_size=25`` and compute total pages
    from it, so the backend must honour the param. ``max_page_size=100``
    matches the ``member_candidates`` action cap.
    """

    page_size_query_param = "page_size"
    page_size = 25
    max_page_size = 100


class LargeResultsPagination(PageNumberPagination):
    """PageNumberPagination that allows clients to request up to 10k rows.

    Used by export-friendly endpoints (overtime/standby logs) so the frontend
    can fetch the full dataset for a client-side export in a single request.
    """

    page_size_query_param = "page_size"
    max_page_size = 10000
