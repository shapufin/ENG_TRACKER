"""Scorecard notification types, registered into the notifications registry.

Imported only by ``signals.connect()`` behind an ``ImportError`` guard, so the
scorecard works unchanged when the notifications plugin is not installed.

Copy is deliberately generic: no names, notes or reasons. A push or lock-screen
preview must not disclose an HR matter, and the link leads to the record itself.
"""
from django.contrib.auth import get_user_model

from apps.users.services.hbpr_scope import hbpr_user_ids_covering, hbpr_user_ids_for
from plugins.notifications.types.base import NotificationType

User = get_user_model()

_RECORDS_LINK = '/tl-scorecard?tab=records'
# HBPR governance notifications open the dedicated HBPR workspace, not the
# AL-TL scorecard (which is the TL's own authoring surface).
_HBPR_LINK = '/hbpr?view=records'


class _HbprAudience:
    """Recipients are the active HBPR assigned to the record's owning AL TL,
    provided the subject is that TL or one of their current team members."""
    owner_field = 'tl_id'

    def recipients(self, context):
        record = context['instance']
        return User.objects.filter(
            id__in=hbpr_user_ids_for(record.employee, getattr(record, self.owner_field))
        )


def _evidence_dedupe(prefix, context, user):
    """One key per evidence row and *version*: the first record and each
    meaningful edit (a new ``updated_at``) notify once, a re-save never does."""
    row = context['instance']
    version = row.updated_at.isoformat() if context.get('edited') else 'new'
    return f'{prefix}:{row.pk}:{version}:user:{user.id}'


# The five grouped HBPR preference keys (Settings shows one row per group with
# independent in-app/push switches, not one row per event).
HBPR_MEETINGS = 'hbpr_meetings'
HBPR_EPR = 'hbpr_epr'
HBPR_PIP_PROMOTION = 'hbpr_pip_promotion'
HBPR_TEAM_RISKS = 'hbpr_team_risks'
HBPR_RECORD_UPDATES = 'hbpr_record_updates'


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
    description = 'Sent to the HR business partner assigned to an Albanian TL when the TL opens an improvement plan.'
    category = 'oversight'
    notification_type = 'warning'
    push_by_default = False
    preference_group = HBPR_PIP_PROMOTION
    preference_group_label = 'PIP & promotion changes'
    link = f'{_HBPR_LINK}&kind=pips'

    def title(self, context):
        return 'Improvement plan awaiting approval'

    def message(self, context):
        return 'A team leader you partner with opened an improvement plan.'

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
    description = 'Sent to the HR business partner assigned to an Albanian TL when an active improvement plan is completed or cancelled.'
    category = 'oversight'
    notification_type = 'info'
    push_by_default = False
    preference_group = HBPR_PIP_PROMOTION
    preference_group_label = 'PIP & promotion changes'
    link = f'{_HBPR_LINK}&kind=pips'

    def title(self, context):
        return 'Improvement plan closed'

    def message(self, context):
        return 'An improvement plan you follow was closed.'

    def dedupe_key(self, context, user):
        return f'pip-closed:{context["instance"].pk}:user:{user.id}'


class FlagRaised(_HbprAudience, NotificationType):
    event_type = 'scorecard_flag_raised'
    label = 'Idle or absence flag raised'
    description = 'Sent to the HR business partner assigned to an Albanian TL when the TL flags idle time or an unexplained absence.'
    category = 'oversight'
    notification_type = 'warning'
    push_by_default = False
    preference_group = HBPR_TEAM_RISKS
    preference_group_label = 'Team risks'
    owner_field = 'flagged_by_id'

    def link_for(self, context, user):
        kind = 'idle' if context['kind'] == 'idle' else 'absences'
        return f'{_HBPR_LINK}&kind={kind}'

    def title(self, context):
        return 'New flag raised'

    def message(self, context):
        return 'A team leader raised a flag for someone you partner with.'


class PromotionNominated(_HbprAudience, NotificationType):
    event_type = 'scorecard_promotion_nominated'
    label = 'Promotion nominated'
    description = 'Sent to the HR business partner assigned to an Albanian TL when the TL nominates someone for promotion.'
    category = 'oversight'
    notification_type = 'info'
    push_by_default = False
    preference_group = HBPR_PIP_PROMOTION
    preference_group_label = 'PIP & promotion changes'
    owner_field = 'nominated_by_id'
    link = f'{_HBPR_LINK}&kind=promotions'

    def title(self, context):
        return 'Promotion nomination to review'

    def message(self, context):
        return 'A team leader nominated someone for promotion.'


class HbprCadenceEvidenceRecorded(NotificationType):
    """The assigned AL TL recorded a cadence meeting with the HBPR."""
    event_type = 'scorecard_hbpr_cadence_evidence'
    label = 'Meeting with your team leader was recorded'
    description = 'Sent to the assigned HBPR when the Albanian TL records a cadence meeting for their partnership.'
    category = 'oversight'
    notification_type = 'info'
    push_by_default = False
    preference_group = HBPR_MEETINGS
    preference_group_label = 'Meetings & cadence'
    link = '/hbpr?view=evidence'

    def recipients(self, context):
        row = context['instance']
        return User.objects.filter(id=row.assignment.hbpr_id, is_active=True)

    def title(self, context):
        if context.get('edited'):
            return 'A partnership meeting was updated'
        return 'A partnership meeting was recorded'

    def message(self, context):
        if context.get('edited'):
            return 'Your team leader updated a cadence meeting for your partnership.'
        return 'Your team leader logged a cadence meeting for your partnership.'

    def dedupe_key(self, context, user):
        return _evidence_dedupe('hbpr-cadence', context, user)


class HbprEprEvidenceRecorded(NotificationType):
    """The assigned AL TL recorded HBPR participation in a mid-year/year-end EPR."""
    event_type = 'scorecard_hbpr_epr_evidence'
    label = 'EPR participation was recorded'
    description = 'Sent to the assigned HBPR when the Albanian TL records their mid-year or year-end EPR participation.'
    category = 'oversight'
    notification_type = 'info'
    push_by_default = False
    preference_group = HBPR_EPR
    preference_group_label = 'EPR milestones'
    link = '/hbpr?view=evidence'

    def recipients(self, context):
        row = context['instance']
        return User.objects.filter(id=row.assignment.hbpr_id, is_active=True)

    def title(self, context):
        if context.get('edited'):
            return 'Your EPR participation was updated'
        return 'Your EPR participation was recorded'

    def message(self, context):
        if context.get('edited'):
            return 'Your team leader updated the record of your participation in their EPR review.'
        return 'Your team leader recorded your participation in their EPR review.'

    def dedupe_key(self, context, user):
        return _evidence_dedupe(f'hbpr-epr:{context["instance"].kind}', context, user)


class HbprReviewDelivered(NotificationType):
    """The AL TL logged a management review delivery — a governance update."""
    event_type = 'scorecard_hbpr_review_delivered'
    label = 'A management review was delivered'
    description = 'Sent to the assigned HBPR when the Albanian TL logs a management review delivery.'
    category = 'oversight'
    notification_type = 'info'
    push_by_default = False
    preference_group = HBPR_RECORD_UPDATES
    preference_group_label = 'Other governance updates'
    link = '/hbpr?view=records'

    def recipients(self, context):
        row = context['instance']
        # A review has no employee subject; the HBPR is the one assigned to the
        # leader who delivered it.
        return User.objects.filter(
            id__in=hbpr_user_ids_for(row.leader, row.leader_id)
        )

    def title(self, context):
        return 'A review was delivered'

    def message(self, context):
        return 'Your team leader logged a management review delivery.'

    def dedupe_key(self, context, user):
        return f'hbpr-review:{context["instance"].pk}:user:{user.id}'


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


class HbprAssignmentChanged(NotificationType):
    """An admin assigned a team leader to the HBPR, or ended the assignment."""
    event_type = 'scorecard_hbpr_assignment_changed'
    label = 'Team leader assignment changed'
    description = 'Sent to an HBPR when an Albanian TL is assigned to them or the assignment ends.'
    category = 'oversight'
    notification_type = 'info'
    push_by_default = False
    preference_group = HBPR_MEETINGS
    preference_group_label = 'Meetings & cadence'
    link = '/hbpr?view=overview'

    def recipients(self, context):
        return User.objects.filter(id=context['instance'].hbpr_id, is_active=True)

    def title(self, context):
        if context['outcome'] == 'ended':
            return 'A team leader assignment ended'
        return 'A team leader was assigned to you'

    def message(self, context):
        if context['outcome'] == 'ended':
            return 'One of your team leader partnerships has ended.'
        return 'You now partner with a new team leader.'

    def dedupe_key(self, context, user):
        return f'hbpr-assignment:{context["instance"].pk}:{context["outcome"]}:user:{user.id}'


class FlagResolved(_HbprAudience, NotificationType):
    """An idle flag was resolved or an absence was addressed."""
    event_type = 'scorecard_flag_resolved'
    label = 'Idle or absence flag resolved'
    description = 'Sent to the HR business partner assigned to an Albanian TL when the TL resolves an idle flag or addresses an absence.'
    category = 'oversight'
    notification_type = 'info'
    push_by_default = False
    preference_group = HBPR_TEAM_RISKS
    preference_group_label = 'Team risks'
    owner_field = 'flagged_by_id'

    def link_for(self, context, user):
        kind = 'idle' if context['kind'] == 'idle' else 'absences'
        return f'{_HBPR_LINK}&kind={kind}'

    def title(self, context):
        return 'A flag was resolved'

    def message(self, context):
        return 'A team leader resolved a flag for someone you partner with.'

    def dedupe_key(self, context, user):
        return f'flag-resolved:{context["kind"]}:{context["instance"].pk}:user:{user.id}'


class EprStageCompleted(NotificationType):
    """A team member's EPR cycle reached a new stage."""
    event_type = 'scorecard_epr_stage_completed'
    label = 'EPR stage completed'
    description = "Sent to the HR business partner assigned to an Albanian TL when one of the TL's team members completes an EPR stage."
    category = 'oversight'
    notification_type = 'info'
    push_by_default = False
    preference_group = HBPR_EPR
    preference_group_label = 'EPR milestones'
    link = f'{_HBPR_LINK}&kind=reviews'

    def recipients(self, context):
        cycle = context['instance']
        return User.objects.filter(id__in=hbpr_user_ids_covering(cycle.user))

    def title(self, context):
        return 'An EPR stage was completed'

    def message(self, context):
        return 'Someone on a team you partner on completed an EPR stage.'

    def dedupe_key(self, context, user):
        return f'epr-stage:{context["instance"].pk}:{context["stage"]}:user:{user.id}'


class HbprMeetingChanged(NotificationType):
    """A governance meeting (never an employee one-on-one) was added or changed."""
    event_type = 'scorecard_hbpr_meeting_changed'
    label = 'Governance meeting changed'
    description = 'Sent to the HR business partner assigned to an Albanian TL when the TL records or changes a team or TL-sync meeting.'
    category = 'oversight'
    notification_type = 'info'
    push_by_default = False
    preference_group = HBPR_RECORD_UPDATES
    preference_group_label = 'Other governance updates'
    link = f'{_HBPR_LINK}&kind=meetings'

    def recipients(self, context):
        meeting = context['instance']
        if meeting.meeting_type == 'one_on_one':
            return User.objects.none()
        subject = meeting.counterparty or meeting.organizer
        return User.objects.filter(
            id__in=hbpr_user_ids_for(subject, meeting.organizer_id)
        )

    def title(self, context):
        return 'A governance meeting was updated'

    def message(self, context):
        return 'A team leader you partner with recorded or changed a meeting.'

    def dedupe_key(self, context, user):
        meeting = context['instance']
        return f'hbpr-meeting:{meeting.pk}:{meeting.updated_at.isoformat()}:user:{user.id}'
