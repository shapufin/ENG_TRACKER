"""HBPR dashboard aggregates, computed in a handful of grouped queries.

Everything is limited to the viewer's ``HbprScope`` with the same rule the record
viewsets use: the owning TL is one of the scope's TLs AND the subject is in scope,
so a record a TL wrote about someone outside the scope is never counted.
"""
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.db.models import Count, Max, Q
from django.utils import timezone

from .models import Absence, IdleFlag, Meeting, PIPRecord, PromotionFlag

User = get_user_model()

ONE_ON_ONE_STALE_DAYS = 35
ABSENCE_OVERDUE_DAYS = 5


def _person(user):
    return {'id': user.id, 'name': user.get_full_name() or user.username} if user else None


def _scoped(model, scope, owner_field, subject_field='employee'):
    return model.objects.filter(**{
        f'{owner_field}__in': scope.tl_ids,
        f'{subject_field}__in': scope.user_ids,
    })


def _people_queryset(scope):
    """Employees under the HBPR: everyone in scope who is not themselves one of the TLs."""
    return (
        User.objects.filter(id__in=scope.member_ids - scope.tl_ids)
        .select_related('profile', 'profile__italian_tl', 'profile__albanian_tl')
    )


def _last_one_on_one(person_ids):
    return {
        counterparty_id: last
        for counterparty_id, last in (
            Meeting.objects.filter(meeting_type='one_on_one', counterparty_id__in=person_ids)
            .values_list('counterparty_id').annotate(last=Max('occurred_on'))
        )
    }


def _open_pip_status(scope):
    """employee id -> 'draft' (awaiting approval) or 'active'."""
    rows = _scoped(PIPRecord, scope, 'tl_id').filter(status__in=('draft', 'active')) \
        .values_list('employee_id', 'approved_at')
    result = {}
    for employee_id, approved_at in rows:
        if result.get(employee_id) != 'active':  # an active plan outranks a draft
            result[employee_id] = 'active' if approved_at else 'draft'
    return result


def _is_stale(last, today):
    return last is None or (today - last) > timedelta(days=ONE_ON_ONE_STALE_DAYS)


def people(scope, search='', limit=50, offset=0):
    qs = _people_queryset(scope)
    if search:
        qs = qs.filter(
            Q(first_name__icontains=search) | Q(last_name__icontains=search)
            | Q(username__icontains=search)
        )
    qs = qs.order_by('first_name', 'last_name', 'username')
    total = qs.count()
    page = list(qs[offset:offset + limit])
    last_meeting = _last_one_on_one([u.id for u in page])
    pip_status = _open_pip_status(scope)
    return {
        'count': total,
        'results': [
            {
                **_person(u),
                'italian_tl': _person(u.profile.italian_tl),
                'albanian_tl': _person(u.profile.albanian_tl),
                'open_pip': pip_status.get(u.id),
                'last_one_on_one': last_meeting.get(u.id),
            }
            for u in page
        ],
    }


def overview(scope):
    today = date.today()
    now = timezone.now()
    tls = list(User.objects.filter(id__in=scope.tl_ids))
    members = list(_people_queryset(scope))
    last_meeting = _last_one_on_one([u.id for u in members])

    # Open plans are few; counting in Python keeps "awaiting approval" defined once
    # (PIPRecord.awaiting_approval), including legacy rows saved as 'active'.
    pip_by_tl, pending_dates = {}, []
    for pip in _scoped(PIPRecord, scope, 'tl_id').filter(status__in=('draft', 'active')):
        state = 'draft' if pip.awaiting_approval else 'active'
        pip_by_tl[(pip.tl_id, state)] = pip_by_tl.get((pip.tl_id, state), 0) + 1
        if state == 'draft':
            pending_dates.append(pip.created_at)
    pending = {'n': len(pending_dates), 'oldest': min(pending_dates, default=None)}
    idle_by_tl = dict(
        _scoped(IdleFlag, scope, 'flagged_by_id').filter(status='open')
        .values_list('flagged_by_id').annotate(n=Count('id'))
    )
    absences = _scoped(Absence, scope, 'flagged_by_id').filter(addressed_on__isnull=True)
    absence_by_tl = dict(absences.values_list('flagged_by_id').annotate(n=Count('id')))
    overdue = absences.filter(absence_date__lte=today - timedelta(days=ABSENCE_OVERDUE_DAYS)).count()
    promotions = _scoped(PromotionFlag, scope, 'nominated_by_id').filter(status='nominated').count()

    team_size, behind = {}, {}
    for u in members:
        for tl_id in {u.profile.italian_tl_id, u.profile.albanian_tl_id} & scope.tl_ids:
            team_size[tl_id] = team_size.get(tl_id, 0) + 1
            if _is_stale(last_meeting.get(u.id), today):
                behind[tl_id] = behind.get(tl_id, 0) + 1

    rows = [
        {
            **_person(tl),
            'team_size': team_size.get(tl.id, 0),
            'pending_pips': pip_by_tl.get((tl.id, 'draft'), 0),
            'active_pips': pip_by_tl.get((tl.id, 'active'), 0),
            'open_idle_flags': idle_by_tl.get(tl.id, 0),
            'open_absences': absence_by_tl.get(tl.id, 0),
            'people_without_recent_one_on_one': behind.get(tl.id, 0),
        }
        for tl in sorted(tls, key=lambda u: (u.get_full_name() or u.username).lower())
    ]
    return {
        'needs_attention': {
            'pips_awaiting_approval': pending['n'],
            'oldest_pip_days': (now - pending['oldest']).days if pending['oldest'] else None,
            'promotions_to_decide': promotions,
            'absences_overdue': overdue,
            'tls_behind_on_one_on_ones': sum(1 for r in rows if r['people_without_recent_one_on_one']),
        },
        'tls': rows,
        'one_on_one_stale_days': ONE_ON_ONE_STALE_DAYS,
        'absence_overdue_days': ABSENCE_OVERDUE_DAYS,
    }
