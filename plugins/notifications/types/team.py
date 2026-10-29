"""Team-notification types — delivered to the actor's team leaders.

``TeamActionRequiredNotification`` is shared by leave, overtime, and standby
submissions. The registry is keyed by ``event_type`` so only one class can
register ``team_action_required``. Its ``message()`` and ``title()`` branch
on ``context['entity_type']`` to produce the exact per-entity strings.
"""
from .base import NotificationType


class TeamActionRequiredNotification(NotificationType):
    event_type = 'team_action_required'
    label = 'Team submissions needing action'
    description = (
        'Sent to team leaders when a team member submits a leave '
        'request, overtime log, or standby log that needs their approval.'
    )
    category = 'team'
    notification_type = 'warning'
    link = '/team/approvals'

    _TITLE_LABELS = {
        'leave': 'Leave Request',
        'overtime': 'Overtime Log',
        'standby': 'Standby Log',
    }

    def recipients(self, context):
        from plugins.notifications.signals import _team_recipients
        return _team_recipients(context['instance'].user)

    def title(self, context):
        entity = context['entity_type']
        label = self._TITLE_LABELS[entity]
        if context.get('resubmitted'):
            return f'Action Required: {label} Resubmitted'
        return f'Action Required: New {label}'

    def message(self, context):
        i = context['instance']
        entity = context['entity_type']
        name = i.user.get_full_name()
        verb = 'resubmitted after editing' if context.get('resubmitted') else 'submitted'
        if entity == 'leave':
            return f'{name} {verb} a leave request for {i.start_date}.'
        elif entity == 'overtime':
            return f'{name} {verb} overtime for {i.date} ({i.hours}h).'
        elif entity == 'standby':
            return f'{name} {verb} standby for {i.date}.'
        raise ValueError(f'Unknown entity_type: {entity}')


class TeamLeaveDeletedNotification(NotificationType):
    event_type = 'team_leave_deleted'
    label = 'Team leave requests deleted'
    description = (
        'Sent to team leaders when a team member deletes one of '
        'their leave requests, so approvers know why it vanished from '
        'their approval queue.'
    )
    category = 'team'
    notification_type = 'warning'
    link = '/team/approvals'

    def recipients(self, context):
        from plugins.notifications.signals import _team_recipients
        return _team_recipients(context['instance'].user)

    def title(self, context):
        return 'Leave Request Deleted'

    def message(self, context):
        i = context['instance']
        return (
            f'{i.user.get_full_name()} deleted their leave request for '
            f'{i.start_date}.'
        )


class _TeamLogDeletedNotification(NotificationType):
    """Shared base: a pending overtime/standby log vanished from the queue."""
    category = 'team'
    notification_type = 'warning'
    link = '/team/approvals'
    noun = ''

    def recipients(self, context):
        from plugins.notifications.signals import _team_recipients
        return _team_recipients(context['instance'].user)

    def title(self, context):
        return f'{self.noun} Deleted'

    def message(self, context):
        i = context['instance']
        return f'{i.user.get_full_name()} deleted their {self.noun.lower()} for {i.date}.'


class TeamOvertimeDeletedNotification(_TeamLogDeletedNotification):
    event_type = 'team_overtime_deleted'
    label = 'Team overtime logs deleted'
    description = (
        'Sent to team leaders when a team member deletes a pending overtime '
        'log, so approvers know why it vanished from their approval queue.'
    )
    noun = 'Overtime Log'


class TeamStandbyDeletedNotification(_TeamLogDeletedNotification):
    event_type = 'team_standby_deleted'
    label = 'Team standby logs deleted'
    description = (
        'Sent to team leaders when a team member deletes a pending standby '
        'log, so approvers know why it vanished from their approval queue.'
    )
    noun = 'Standby Log'
