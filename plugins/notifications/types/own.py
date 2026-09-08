"""Own-notification types — delivered to the actor.

Each class owns its event_type, label, message template, and recipient
rule (always the actor). The signal dispatcher reads ``_old_status`` /
``_old_values`` and decides which class to dispatch.
"""
from .base import NotificationType


class LeaveSubmittedNotification(NotificationType):
    event_type = 'own_leave_submitted'
    label = 'My leave submitted'
    notification_type = 'info'

    def recipients(self, context):
        return [context['instance'].user]

    def title(self, context):
        return 'New Leave Request'

    def message(self, context):
        i = context['instance']
        return f'Your leave request for {i.start_date} has been submitted.'


class LeaveUpdatedNotification(NotificationType):
    event_type = 'own_leave_updated'
    label = 'My leave approved or rejected'

    def recipients(self, context):
        return [context['instance'].user]

    def title(self, context):
        return 'Leave Request Updated'

    def message(self, context):
        i = context['instance']
        return f'Your leave request for {i.start_date} is now {i.status}.'

    def notification_type(self, context):
        return 'success' if context['instance'].status == 'approved' else 'warning'


class LeaveEditedNotification(NotificationType):
    event_type = 'own_leave_edited'
    label = 'My leave edited'
    notification_type = 'info'

    def recipients(self, context):
        return [context['instance'].user]

    def title(self, context):
        return 'Leave Request Edited'

    def message(self, context):
        return (
            f"Your leave request was edited. Changed: "
            f"{', '.join(context['changed_fields'])}"
        )


class OvertimeSubmittedNotification(NotificationType):
    event_type = 'own_overtime_submitted'
    label = 'My overtime submitted'
    notification_type = 'info'

    def recipients(self, context):
        return [context['instance'].user]

    def title(self, context):
        return 'New Overtime Log'

    def message(self, context):
        i = context['instance']
        return f'Your overtime log for {i.date} ({i.hours}h) has been submitted.'


class OvertimeUpdatedNotification(NotificationType):
    event_type = 'own_overtime_updated'
    label = 'My overtime approved or rejected'

    def recipients(self, context):
        return [context['instance'].user]

    def title(self, context):
        return 'Overtime Log Updated'

    def message(self, context):
        i = context['instance']
        return f'Your overtime log for {i.date} is now {i.status}.'

    def notification_type(self, context):
        return 'success' if context['instance'].status == 'approved' else 'warning'


class StandbySubmittedNotification(NotificationType):
    event_type = 'own_standby_submitted'
    label = 'My standby submitted'
    notification_type = 'info'

    def recipients(self, context):
        return [context['instance'].user]

    def title(self, context):
        return 'New Standby Log'

    def message(self, context):
        i = context['instance']
        return f'Your standby log for {i.date} has been submitted.'


class StandbyUpdatedNotification(NotificationType):
    event_type = 'own_standby_updated'
    label = 'My standby approved or rejected'

    def recipients(self, context):
        return [context['instance'].user]

    def title(self, context):
        return 'Standby Log Updated'

    def message(self, context):
        i = context['instance']
        return f'Your standby log for {i.date} is now {i.status}.'

    def notification_type(self, context):
        return 'success' if context['instance'].status == 'approved' else 'warning'
