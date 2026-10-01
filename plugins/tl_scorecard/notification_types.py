"""Scorecard notification types, registered into the notifications registry.

Imported only by ``signals.connect()`` behind an ``ImportError`` guard, so the
scorecard works unchanged when the notifications plugin is not installed.

Copy is deliberately generic: no names, notes or reasons. A push or lock-screen
preview must not disclose an HR matter, and the link leads to the record itself.
"""
from django.contrib.auth import get_user_model

from apps.users.services.hbpr_scope import hbpr_user_ids_for
from plugins.notifications.types.base import NotificationType

User = get_user_model()

_RECORDS_LINK = '/tl-scorecard?tab=records'


class _HbprAudience:
    """Recipients are the active HBPRs covering the record's employee, provided
    the TL who wrote it is also in their scope."""
    owner_field = 'tl_id'

    def recipients(self, context):
        record = context['instance']
        return User.objects.filter(
            id__in=hbpr_user_ids_for(record.employee, getattr(record, self.owner_field))
        )


class _RecordsItem(NotificationType):
    """Something a TL added to the employee's own My-records page. Generic copy:
    the employee reads the content there, not on a lock screen."""
    category = 'own'
    notification_type = 'info'
    push_by_default = False
    link = '/my-records'

    def title(self, context):
        return 'New item in your records'

    def message(self, context):
        return 'Your team leader added something to your records.'


class RecordShared(_RecordsItem):
    event_type = 'scorecard_record_shared'
    label = 'A 1-on-1 summary was shared with me'
    description = 'Sent to an employee when their team leader shares a 1-on-1 summary with them.'

    def recipients(self, context):
        meeting = context['instance']
        return User.objects.filter(id=meeting.counterparty_id, is_active=True)

    def dedupe_key(self, context, user):
        return f'record-shared:{context["instance"].pk}:user:{user.id}'


class PipStarted(_RecordsItem):
    event_type = 'scorecard_pip_started'
    label = 'An improvement plan was added to my records'
    description = 'Sent to an employee when an improvement plan about them is approved (never while it is a draft).'

    def recipients(self, context):
        return User.objects.filter(id=context['instance'].employee_id, is_active=True)

    def dedupe_key(self, context, user):
        return f'pip-started:{context["instance"].pk}:user:{user.id}'


class PipAwaitingApproval(_HbprAudience, NotificationType):
    event_type = 'scorecard_pip_pending'
    label = 'Improvement plan awaiting approval'
    description = 'Sent to the HR business partners covering an employee when a TL opens an improvement plan that needs approval.'
    category = 'oversight'
    notification_type = 'warning'
    push_by_default = False
    link = f'{_RECORDS_LINK}&kind=pips'

    def title(self, context):
        return 'Improvement plan awaiting approval'

    def message(self, context):
        return 'A team leader opened an improvement plan that needs your review.'

    def dedupe_key(self, context, user):
        return f'pip-pending:{context["instance"].pk}:user:{user.id}'


class PipDecided(NotificationType):
    event_type = 'scorecard_pip_decided'
    label = 'My improvement plan decision'
    description = 'Sent to a team leader when HR approves or returns an improvement plan they opened.'
    category = 'team'
    notification_type = 'info'
    push_by_default = False
    link = f'{_RECORDS_LINK}&kind=pips'

    def recipients(self, context):
        pip = context['instance']
        return User.objects.filter(id=pip.tl_id, is_active=True)

    def title(self, context):
        return f'Improvement plan {context["outcome"]}'

    def message(self, context):
        return f'An improvement plan you opened was {context["outcome"]}.'

    def dedupe_key(self, context, user):
        return f'pip-decided:{context["instance"].pk}:{context["outcome"]}:user:{user.id}'


class PipClosed(_HbprAudience, NotificationType):
    event_type = 'scorecard_pip_closed'
    label = 'Improvement plan closed'
    description = 'Sent to the HR business partners covering an employee when an active improvement plan is completed or cancelled.'
    category = 'oversight'
    notification_type = 'info'
    push_by_default = False
    link = f'{_RECORDS_LINK}&kind=pips'

    def title(self, context):
        return 'Improvement plan closed'

    def message(self, context):
        return 'An improvement plan you follow was closed.'

    def dedupe_key(self, context, user):
        return f'pip-closed:{context["instance"].pk}:user:{user.id}'


class FlagRaised(_HbprAudience, NotificationType):
    event_type = 'scorecard_flag_raised'
    label = 'Idle or absence flag raised'
    description = 'Sent to the HR business partners covering an employee when a TL flags idle time or an unexplained absence.'
    category = 'oversight'
    notification_type = 'warning'
    push_by_default = False
    owner_field = 'flagged_by_id'

    def link_for(self, context, user):
        kind = 'idle' if context['kind'] == 'idle' else 'absences'
        return f'{_RECORDS_LINK}&kind={kind}'

    def title(self, context):
        return 'New flag raised'

    def message(self, context):
        return 'A team leader raised a flag for someone you partner with.'


class PromotionNominated(_HbprAudience, NotificationType):
    event_type = 'scorecard_promotion_nominated'
    label = 'Promotion nominated'
    description = 'Sent to the HR business partners covering an employee when a TL nominates them for promotion.'
    category = 'oversight'
    notification_type = 'info'
    push_by_default = False
    owner_field = 'nominated_by_id'
    link = f'{_RECORDS_LINK}&kind=promotions'

    def title(self, context):
        return 'Promotion nomination to review'

    def message(self, context):
        return 'A team leader nominated someone for promotion.'


class PromotionDecided(NotificationType):
    event_type = 'scorecard_promotion_decided'
    label = 'My promotion nomination decision'
    description = 'Sent to a team leader when HR decides a promotion they nominated.'
    category = 'team'
    notification_type = 'info'
    push_by_default = False
    link = f'{_RECORDS_LINK}&kind=promotions'

    def recipients(self, context):
        return User.objects.filter(id=context['instance'].nominated_by_id, is_active=True)

    def title(self, context):
        return 'Promotion nomination decided'

    def message(self, context):
        return 'A promotion you nominated has been decided.'

    def dedupe_key(self, context, user):
        return f'promotion-decided:{context["instance"].pk}:user:{user.id}'
