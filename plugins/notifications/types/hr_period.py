"""Month-closure notifications for HR.

HR finalizes payroll, so HR hears when a Line Manager or Manager closes a
month for their scope and when the last scope is closed (payroll can be
finalized). Neither event is sent for the system's own cutoff close.
"""
from django.contrib.auth import get_user_model
from django.db.models import Q

from .base import NotificationType

LINK = '/hr/payroll/runs'


# HR membership lives in two places (the role row and the legacy profile flag).
_IS_HR = Q(profile__is_hr_user=True) | Q(user_roles__role__code='hr', user_roles__is_active=True)


def _hr_users():
    """Active HR users."""
    return get_user_model().objects.filter(is_active=True).filter(_IS_HR).distinct()


def _hr_recipients(close):
    """HR users minus the closer."""
    return _hr_users().exclude(pk=close.closed_by_id)


def _month_label(close):
    return f'{close.period:%B %Y}'


class HrPeriodScopeClosedNotification(NotificationType):
    event_type = 'hr_period_scope_closed'
    label = 'Month closed by a Line Manager or Manager'
    description = (
        'Sent to HR when a Line Manager or Manager closes the monthly '
        'overtime/standby approval period for their scope.'
    )
    category = 'hr'
    link = LINK

    def recipients(self, context):
        return _hr_recipients(context['close'])

    def title(self, context):
        return f'{_month_label(context["close"])} closed for a team'

    def message(self, context):
        close = context['close']
        closer = close.closed_by
        who = (closer.get_full_name() or closer.username) if closer else 'A leader'
        text = f'{who} closed {_month_label(close)} for their scope.'
        progress = context.get('progress')
        if progress:
            closed, total = progress
            text += f' {closed} of {total} users are now closed.'
        return text

    def dedupe_key(self, context, user):
        return f'hr-period-scope:{context["close"].pk}:user:{user.id}'


class HrPeriodReadyNotification(NotificationType):
    event_type = 'hr_period_ready'
    label = 'Month ready to finalize payroll'
    description = (
        'Sent to HR once every user of the draft payroll run for a month is '
        'closed, so the run can be finalized.'
    )
    category = 'hr'
    notification_type = 'success'
    link = LINK

    def recipients(self, context):
        return _hr_recipients(context['close'])

    def title(self, context):
        return f'{_month_label(context["close"])} is ready to finalize'

    def message(self, context):
        return (
            f'Every user is closed for {_month_label(context["close"])}. '
            'The payroll run will be finalized automatically.'
        )

    def dedupe_key(self, context, user):
        return f'hr-period-ready:{context["close"].period:%Y-%m}:user:{user.id}'


class HrPayrollAutoFinalizedNotification(NotificationType):
    event_type = 'hr_payroll_auto_finalized'
    label = 'Payroll finalized automatically'
    description = (
        'Sent to HR when the system finalizes a month\'s payroll run by itself: '
        'early, once every user is closed, or at the cutoff.'
    )
    category = 'hr'
    notification_type = 'success'
    link = LINK

    def recipients(self, context):
        return _hr_users()

    def title(self, context):
        run = context['run']
        return f'Payroll for {run.period_label} was finalized automatically'

    def message(self, context):
        run = context['run']
        when = (
            'every user was closed' if context.get('reason') == 'early'
            else 'the month cutoff passed'
        )
        return (
            f'The {run.period_label} payroll run was finalized by the system because {when}. '
            'Exports are ready.'
        )

    def dedupe_key(self, context, user):
        return f'hr-payroll-auto-finalized:{context["run"].pk}:user:{user.id}'


class HrPayrollAutoFinalizeFailedNotification(NotificationType):
    event_type = 'hr_payroll_auto_finalize_failed'
    label = 'Automatic payroll finalize failed'
    description = (
        "Sent to HR and administrators when the system could not finalize a month's "
        'payroll run by itself, so an administrator can step in.'
    )
    category = 'hr'
    notification_type = 'error'
    link = LINK

    def recipients(self, context):
        return (
            get_user_model().objects.filter(is_active=True)
            .filter(_IS_HR | Q(is_staff=True) | Q(is_superuser=True))
            .distinct()
        )

    def title(self, context):
        return f'Automatic payroll finalize failed for {context["run"].period_label}'

    def message(self, context):
        return (
            f'The system could not finalize the {context["run"].period_label} payroll run: '
            f'{(context.get("error") or "unknown error").rstrip(".")}. An administrator must review the draft '
            'and finalize it by hand.'
        )

    def dedupe_key(self, context, user):
        return f'hr-payroll-auto-failed:{context["run"].pk}:user:{user.id}'
