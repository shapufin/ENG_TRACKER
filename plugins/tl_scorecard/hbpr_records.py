"""Server-side paging of the governance records an HBPR may read.

The page is produced by the **existing** resource viewsets (their scoped
``get_queryset`` and their redacting serializers), so this module holds no
second copy of the security logic: whatever the viewset would list for this
HBPR is exactly what can appear here. It only adds the common filters and the
limit/offset window.
"""
import re
from dataclasses import dataclass
from typing import Callable

from rest_framework.exceptions import ValidationError

from .viewsets import (
    AbsenceViewSet,
    IdleFlagViewSet,
    MeetingViewSet,
    PIPRecordViewSet,
    PromotionFlagViewSet,
    ReviewDeliveryViewSet,
)

MAX_LIMIT = 100
_PERIOD = re.compile(r'^(\d{4})-(0[1-9]|1[0-2])$')


def _equals(field):
    return lambda qs, value: qs.filter(**{field: value})


def _absence_status(qs, value):
    if value == 'addressed':
        return qs.filter(addressed_on__isnull=False)
    if value == 'open':
        return qs.filter(addressed_on__isnull=True)
    raise ValidationError({'status': 'status must be "open" or "addressed".'})


@dataclass(frozen=True)
class RecordSpec:
    viewset: type
    leader_field: str
    date_field: str
    status_filter: Callable | None = None
    statuses: tuple = ()


# Keys are the `?kind=` vocabulary shared with the notification deep links.
RECORD_SPECS = {
    'meetings': RecordSpec(
        MeetingViewSet, 'organizer', 'occurred_on', _equals('meeting_type'),
        ('team_meeting', 'tl_sync'),
    ),
    'idle': RecordSpec(
        IdleFlagViewSet, 'flagged_by', 'flagged_on', _equals('status'), ('open', 'resolved'),
    ),
    'absences': RecordSpec(
        AbsenceViewSet, 'flagged_by', 'absence_date', _absence_status, ('open', 'addressed'),
    ),
    'reviews': RecordSpec(ReviewDeliveryViewSet, 'leader', 'delivered_on'),
    'pips': RecordSpec(
        PIPRecordViewSet, 'tl', 'start_date', _equals('status'),
        ('draft', 'active', 'completed', 'cancelled'),
    ),
    'promotions': RecordSpec(
        PromotionFlagViewSet, 'nominated_by', 'nominated_on', _equals('status'),
        ('nominated', 'promoted', 'declined'),
    ),
}


def parse_period(raw):
    if not raw:
        return None
    match = _PERIOD.match(raw)
    if not match:
        raise ValidationError({'period': 'period must be YYYY-MM.'})
    return int(match.group(1)), int(match.group(2))


def records_page(request, *, kind, leader=None, status=None, period=None, limit=25, offset=0):
    """``{count, results}`` for one record kind, scoped and redacted by its viewset."""
    spec = RECORD_SPECS.get(kind)
    if spec is None:
        raise ValidationError({'kind': f'kind must be one of {sorted(RECORD_SPECS)}.'})

    view = spec.viewset()
    view.request = request
    view.action = 'list'
    view.format_kwarg = None
    view.args = ()
    view.kwargs = {}

    qs = view.get_queryset()
    if leader is not None:
        qs = qs.filter(**{spec.leader_field: leader})
    if status:
        if spec.status_filter is None:
            raise ValidationError({'status': f'{kind} records have no status filter.'})
        qs = spec.status_filter(qs, status)
    parsed = parse_period(period)
    if parsed:
        year, month = parsed
        qs = qs.filter(**{f'{spec.date_field}__year': year, f'{spec.date_field}__month': month})

    total = qs.count()
    window = list(qs[offset:offset + limit])
    serializer = view.get_serializer(window, many=True)
    return {'count': total, 'results': serializer.data}
