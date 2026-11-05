"""Urgent month-closure reminder for Line Managers and Managers.

Sent once per leader and month from the last working day of the month, to
whoever still has users to close before the cutoff. The frontend recognises it
by the ``tl-urgent-close:`` dedupe-key prefix and gives it the urgent treatment.
"""
from apps.users.services.approval_periods import LATE_CLOSURE_PENALTY_POINTS

from .base import NotificationType

URGENT_DEDUPE_PREFIX = 'tl-urgent-close:'


class TlPeriodClosureUrgentNotification(NotificationType):
    event_type = 'tl_period_closure_urgent'
    label = 'Urgent: monthly period finalization required'
    description = (
        'Sent to a Line Manager (or Manager) who still has users to close for the '
        'month, from the last working day of the month until the cutoff.'
    )
    category = 'team'
    notification_type = 'error'
    # Compliance notice with a score consequence: not switchable by the recipient.
    user_configurable = False
    link = '/team/approvals'

    def recipients(self, context):
        return context['leaders']

    def title(self, context):
        return f'Urgent: finalize {context["period"]:%B %Y} approvals'

    def message(self, context):
        return (
            f'Your team approvals for {context["period"]:%B %Y} are not finalized yet. '
            f'Finalize them before {context["cutoff_day"]:%A %d %B %Y}. After that the system '
            f'closes them for you and your engagement score drops by '
            f'{LATE_CLOSURE_PENALTY_POINTS:g} points.'
        )

    def dedupe_key(self, context, user):
        return f'{URGENT_DEDUPE_PREFIX}{context["period"]:%Y-%m}:user:{user.id}'
