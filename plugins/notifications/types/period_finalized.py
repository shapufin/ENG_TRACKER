"""Period-finalized notification — delivered to team members when a TL
finalizes an approval period. Excludes the closer and CR-only users.
"""
from .base import NotificationType


def _next_period(period):
    """Compute the first day of the month after ``period``."""
    if period.month == 12:
        return period.replace(year=period.year + 1, month=1, day=1)
    return period.replace(month=period.month + 1, day=1)


class PeriodFinalizedNotification(NotificationType):
    event_type = 'team_period_finalized'
    label = 'My team period finalized'
    # Viewset categorizes this as 'own' because every user can subscribe
    # to their own period-finalized notice (it's delivered to individual
    # members, not to TLs).
    category = 'own'
    notification_type = 'info'
    link = '/overtime'

    def recipients(self, context):
        close = context['close']
        try:
            from plugins.control_room.services.scope_service import (
                get_calendar_excluded_user_ids,
            )
            cr_only_ids = get_calendar_excluded_user_ids()
        except ImportError:
            cr_only_ids = set()
        return [
            m.user for m in close.members.all()
            if m.user_id != close.closed_by_id
            and m.user_id not in cr_only_ids
        ]

    def title(self, context):
        close = context['close']
        return f'{close.period:%B %Y} overtime and standby period finalized'

    def message(self, context):
        close = context['close']
        period_label = close.period.strftime('%B %Y')
        next_label = _next_period(close.period).strftime('%B %Y')
        closed_label = close.closed_at.strftime('%d/%m/%Y at %H:%M')
        return (
            f'Your TL finalized {period_label} overtime and standby submissions '
            f'on {closed_label}. Records submitted from this time onward will '
            f'be processed in {next_label} payroll. Work dates remain unchanged.'
        )

    def dedupe_key(self, context, user):
        return f'period-close:{context["close"].pk}:user:{user.id}'
