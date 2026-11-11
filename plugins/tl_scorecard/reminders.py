"""Reminders for the HBPR cadence: the due day, and once it is overdue.

Run by the hourly scheduler job ``process_cadence_reminders_tick`` and idempotent:
each notification carries a key per assignment, due date and stage, so a re-run (or
the next hour) never repeats one. Reads only; the notifications plugin is optional.
"""
from apps.users.models.hbpr import HbprAlbanianTlAssignment
from apps.users.services.hbpr_assignments import in_effect_q
from core.utils.timezone_local import business_today

from .models import HbprGovernanceEvidence


def process_cadence_reminders(today=None) -> int:
    """Notify for every assignment in effect whose next slot is due today or overdue.

    Returns how many assignments produced a reminder (due or overdue)."""
    try:
        from . import notification_types as types
    except ImportError:  # pragma: no cover - notifications plugin not installed
        return 0

    today = today or business_today()
    assignments = list(
        HbprAlbanianTlAssignment.objects.filter(in_effect_q(today))
        .select_related('hbpr', 'albanian_tl')
    )
    last_slot = {}
    for assignment_id, occurred_on in HbprGovernanceEvidence.objects.filter(
        assignment__in=assignments, kind='cadence_meeting',
    ).values_list('assignment_id', 'occurred_on'):
        if last_slot.get(assignment_id) is None or occurred_on > last_slot[assignment_id]:
            last_slot[assignment_id] = occurred_on

    notified = 0
    for assignment in assignments:
        due = assignment.next_due_on(last_meeting_on=last_slot.get(assignment.id))
        if due > today:
            continue
        cls = types.HbprCadenceDue if due == today else types.HbprCadenceOverdue
        cls().dispatch({'assignment': assignment, 'due_on': due})
        notified += 1
    return notified


def process_cadence_reminders_tick() -> None:
    """Scheduler entry (hourly)."""
    process_cadence_reminders()
