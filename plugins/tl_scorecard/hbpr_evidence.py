"""Partnership evidence derived from an employee's EPR stage.

One writer for the live path (``complete_stage``) and the backfill command, so
both create the same row, once per assignment, kind and year.
"""
from apps.users.services.hbpr_assignments import active_assignment_for_tl
from core.utils.timezone_local import business_today

from .models import EPRStageRecord, HbprGovernanceEvidence

EVIDENCE_KIND = {'mid_year': 'epr_mid_year', 'final_review': 'epr_year_end'}


def log_attended_stage(cycle, stage, recorded_by, on_date=None):
    """Create the Line Manager's mid-year / year-end partnership row for ``cycle``.

    ``on_date`` is when the stage was held (default today): it picks the assignment
    in effect then and dates a new row. Returns ``(row, created)`` or ``(None, False)``
    when the stage has no partnership row or the employee's Line Manager had no HBPR
    assignment that day.
    """
    kind = EVIDENCE_KIND.get(stage)
    profile = getattr(cycle.user, 'profile', None)
    if kind is None or profile is None or not profile.albanian_tl_id:
        return None, False
    on_date = on_date or business_today()
    assignment = active_assignment_for_tl(profile.albanian_tl_id, on_date=on_date)
    if assignment is None:
        return None, False
    return HbprGovernanceEvidence.objects.get_or_create(
        assignment=assignment, kind=kind, reporting_year=cycle.year,
        defaults={
            'occurred_on': max(on_date, assignment.effective_from),
            'shared_summary': (
                f'HBPR attended the {EPRStageRecord(stage=stage).get_stage_display()} '
                'review of a team member (recorded from the EPR cycle).'
            ),
            'recorded_by': recorded_by,
        },
    )
