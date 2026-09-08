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
        return f'Action Required: New {self._TITLE_LABELS[entity]}'

    def message(self, context):
        i = context['instance']
        entity = context['entity_type']
        name = i.user.get_full_name()
        if entity == 'leave':
            return f'{name} submitted a leave request for {i.start_date}.'
        elif entity == 'overtime':
            return f'{name} submitted overtime for {i.date} ({i.hours}h).'
        elif entity == 'standby':
            return f'{name} submitted standby for {i.date}.'
        raise ValueError(f'Unknown entity_type: {entity}')


class TeamLeaveDeletedNotification(NotificationType):
    event_type = 'team_leave_deleted'
    label = 'Team leave requests deleted'
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
