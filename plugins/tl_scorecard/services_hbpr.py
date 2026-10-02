"""HBPR workspace aggregates, computed in a handful of grouped queries.

Everything is limited to the viewer's ``HbprScope`` with the same rule the record
viewsets use: the owning TL is one of the viewer's assigned Albanian TLs AND the
subject is in that assignment's population, so a record a TL wrote about someone
outside the assignment is never counted.

Two things are deliberately **not** surfaced here:

* Employee one-on-one meetings — an HBPR sees governance records, not the
  private employee 1:1, so there is no "behind on 1-on-1s" metric.
* Approval/decision counts (PIP awaiting approval, promotions to decide) — those
  are HR/staff decisions the HBPR does not make, so an attention card about them
  would imply an action the HBPR cannot take. The HBPR's attention surface is
  cadence and EPR governance evidence only.
"""
from datetime import date, timedelta

from django.contrib.auth import get_user_model

from apps.users.models.hbpr import HbprAlbanianTlAssignment
from apps.users.services.hbpr_assignments import cadence_status

from .models import HbprGovernanceEvidence, PIPRecord

User = get_user_model()

# An evidence row recorded within this window is "new governance activity".
RECENT_EVIDENCE_DAYS = 7
EPR_KINDS = ('epr_mid_year', 'epr_year_end')


def _person(user):
    return {'id': user.id, 'name': user.get_full_name() or user.username} if user else None


def parse_reporting_year(raw):
    """Validate an optional ``?year=`` (2000–2100); ``None``/empty = current year.

    Raises ``ValueError`` with a message the viewset turns into a 400 — shared by
    the HBPR overview and the AL-TL partnership so both reject the same inputs.
    """
    if raw in (None, ''):
        return None
    try:
        year = int(raw)
    except (TypeError, ValueError):
        raise ValueError('year must be an integer.')
    if year < 2000 or year > 2100:
        raise ValueError('year must be between 2000 and 2100.')
    return year


def _scoped(model, scope, owner_field, subject_field='employee'):
    return model.objects.filter(**{
        f'{owner_field}__in': scope.tl_ids,
        f'{subject_field}__in': scope.user_ids,
    })


def _people_queryset(scope):
    """Employees under the HBPR: everyone in scope who is not one of the TLs."""
    return (
        User.objects.filter(id__in=scope.member_ids - scope.tl_ids)
        .select_related('profile', 'profile__italian_tl', 'profile__albanian_tl')
    )


def _open_pip_status(scope):
    """employee id -> 'draft' (awaiting approval) or 'active'."""
    rows = _scoped(PIPRecord, scope, 'tl_id').filter(status__in=('draft', 'active')) \
        .values_list('employee_id', 'approved_at')
    result = {}
    for employee_id, approved_at in rows:
        if result.get(employee_id) != 'active':  # an active plan outranks a draft
            result[employee_id] = 'active' if approved_at else 'draft'
    return result


def people(scope, search='', limit=50, offset=0):
    qs = _people_queryset(scope)
    if search:
        from django.db.models import Q

        qs = qs.filter(
            Q(first_name__icontains=search) | Q(last_name__icontains=search)
            | Q(username__icontains=search)
        )
    qs = qs.order_by('first_name', 'last_name', 'username')
    total = qs.count()
    page = list(qs[offset:offset + limit])
    pip_status = _open_pip_status(scope)
    return {
        'count': total,
        'results': [
            {
                **_person(u),
                'italian_tl': _person(u.profile.italian_tl),
                'albanian_tl': _person(u.profile.albanian_tl),
                'open_pip': pip_status.get(u.id),
            }
            for u in page
        ],
    }


def _team_sizes(assignments, scope):
    """AL TL id -> number of in-scope members under that TL.

    Uses the same ``get_team_member_ids()`` sources the scope population uses
    (direct `italian_tl`/`albanian_tl` FK **and** shared-team membership), then
    intersects with the scope. Counting only the direct FK would report fewer
    members than the HBPR can actually see records for.

    Costs a few queries per *assignment*, never per member — so the overview's
    query count still does not grow with headcount.
    """
    sizes = {}
    for assignment in assignments:
        profile = getattr(assignment.albanian_tl, 'profile', None)
        sizes[assignment.albanian_tl_id] = (
            len(profile.get_team_member_ids() & scope.member_ids) if profile is not None else 0
        )
    return sizes


def _evidence_rollup(assignment_ids, year):
    """Per-assignment evidence facts in one pass over the rows."""
    last_cadence, last_evidence, counts, epr = {}, {}, {}, {}
    rows = HbprGovernanceEvidence.objects.filter(
        assignment_id__in=assignment_ids,
    ).values('assignment_id', 'kind', 'reporting_year', 'occurred_on')
    for row in rows:
        aid = row['assignment_id']
        counts[aid] = counts.get(aid, 0) + 1
        occurred_on = row['occurred_on']
        if last_evidence.get(aid) is None or occurred_on > last_evidence[aid]:
            last_evidence[aid] = occurred_on
        if row['kind'] == 'cadence_meeting':
            if last_cadence.get(aid) is None or occurred_on > last_cadence[aid]:
                last_cadence[aid] = occurred_on
        elif row['kind'] in EPR_KINDS and row['reporting_year'] == year:
            epr.setdefault(aid, set()).add(row['kind'])
    return last_cadence, last_evidence, counts, epr


def overview(scope, *, reporting_year=None):
    today = date.today()
    year = reporting_year or today.year

    assignments = list(
        HbprAlbanianTlAssignment.objects.filter(id__in=scope.assignment_ids)
        .select_related('albanian_tl', 'albanian_tl__profile')
        .order_by('albanian_tl__first_name', 'albanian_tl__last_name', 'albanian_tl__username')
    )
    assignment_ids = [a.id for a in assignments]
    team_sizes = _team_sizes(assignments, scope)
    last_cadence, last_evidence, counts, epr = _evidence_rollup(assignment_ids, year)

    leaders = []
    for assignment in assignments:
        last_meeting_on = last_cadence.get(assignment.id)
        leaders.append({
            **_person(assignment.albanian_tl),
            'assignment_id': assignment.id,
            'cadence': assignment.cadence,
            'team_size': team_sizes.get(assignment.albanian_tl_id, 0),
            'last_meeting_on': last_meeting_on,
            'next_due_on': (
                assignment.next_due_on(last_meeting_on=last_meeting_on)
                if assignment.is_current else None
            ),
            'cadence_status': cadence_status(assignment, last_meeting_on=last_meeting_on, on_date=today),
            'epr_mid_year': 'epr_mid_year' in epr.get(assignment.id, ()),
            'epr_year_end': 'epr_year_end' in epr.get(assignment.id, ()),
            'evidence_count': counts.get(assignment.id, 0),
            'last_evidence_on': last_evidence.get(assignment.id),
        })

    recent_since = today - timedelta(days=RECENT_EVIDENCE_DAYS)
    recent_evidence = HbprGovernanceEvidence.objects.filter(
        assignment_id__in=assignment_ids, occurred_on__gte=recent_since,
    ).count()

    return {
        'reporting_year': year,
        'recent_evidence_days': RECENT_EVIDENCE_DAYS,
        'needs_attention': {
            'cadence_overdue': sum(1 for r in leaders if r['cadence_status'] == 'overdue'),
            'cadence_due': sum(1 for r in leaders if r['cadence_status'] == 'due'),
            'missing_mid_year_evidence': sum(1 for r in leaders if not r['epr_mid_year']),
            'missing_year_end_evidence': sum(1 for r in leaders if not r['epr_year_end']),
            'recent_evidence': recent_evidence,
        },
        'leaders': leaders,
    }


def partnership(leader, *, reporting_year=None):
    """One Albanian TL's own HBPR partnership, or ``{'assignment': None}``.

    The AL TL authors the evidence but cannot read the staff-only assignment API,
    so this is where they learn who their HBPR is and what the cadence/EPR state
    is. It shares ``_evidence_rollup``/``cadence_status`` with the HBPR overview,
    so the AL TL's view and the HBPR's view can never disagree.
    """
    from apps.users.services.hbpr_assignments import active_assignment_for_tl

    today = date.today()
    year = reporting_year or today.year
    assignment = active_assignment_for_tl(leader.id, on_date=today)
    if assignment is None:
        return {'reporting_year': year, 'assignment': None}

    last_cadence, last_evidence, counts, epr = _evidence_rollup([assignment.id], year)
    last_meeting_on = last_cadence.get(assignment.id)
    return {
        'reporting_year': year,
        'assignment': {
            'id': assignment.id,
            'hbpr': _person(assignment.hbpr),
            'cadence': assignment.cadence,
            'effective_from': assignment.effective_from.isoformat(),
            'last_meeting_on': last_meeting_on,
            'next_due_on': (
                assignment.next_due_on(last_meeting_on=last_meeting_on)
                if assignment.is_current else None
            ),
            'cadence_status': cadence_status(
                assignment, last_meeting_on=last_meeting_on, on_date=today
            ),
            'epr_mid_year': 'epr_mid_year' in epr.get(assignment.id, ()),
            'epr_year_end': 'epr_year_end' in epr.get(assignment.id, ()),
            'evidence_count': counts.get(assignment.id, 0),
            'last_evidence_on': last_evidence.get(assignment.id),
        },
    }
