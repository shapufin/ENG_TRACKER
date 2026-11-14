"""Why a user cannot be deleted, and the superuser override that erases one anyway.

Deleting a ``User`` cascades over every CASCADE relation to it: the person's own requests
and records a leader wrote about other people (PIPs, meetings, frozen scorecard months).
The ordinary delete paths refuse while any such row exists. A superuser can erase an
inactive user after a preview, a typed phrase and a reason; payroll and evidence rows
(PROTECT) and closed years are never erased.

Everything here reads Django's own relation list, so core never imports a plugin and a
new CASCADE relation blocks a delete until it is added to ``HOUSEKEEPING_MODELS`` on purpose.
"""
from django.db import models, transaction
from django.db.models.deletion import Collector, ProtectedError
from django.dispatch import Signal

# Rows that describe the account itself and are safe to lose with it.
HOUSEKEEPING_MODELS = frozenset({
    'admin.LogEntry',
    'audit_log.AuditLogFilter',
    'control_room.ControlRoomAccess',
    'dashboard.UserCalendarPreference',
    'dashboard.UserDashboardPreference',
    'leave_management.LeaveBalance',  # created automatically for every user
    'notifications.IdempotencyRecord',
    'notifications.Notification',
    'notifications.NotificationPreference',
    'notifications.OfflineSubmissionIdempotency',
    'notifications.PushSubscription',
    'permissions.UserGroup',
    'permissions.UserRole',
    'users.MFABackupCode',
    'users.UserMFA',
    'users.UserProfile',
})

DELETE_BLOCKED_DETAIL = (
    'This user has records that must be kept ({summary}). Deactivate the user instead.'
)

# Sent after a superuser erased a user (kwargs: user_id, username, actor_id, reason, rows).
user_erased = Signal()

MIN_ERASE_REASON_LENGTH = 10
# Frozen for everyone by a ClosedYear (item 31); leave is exempt there and here.
CLOSED_YEAR_MODELS = frozenset({'overtime.OvertimeLog', 'standby.StandbyLog'})


def user_delete_blockers(user) -> dict[str, int]:
    """Rows a delete would destroy, as ``{model label: count}``; empty when it is safe."""
    blockers: dict[str, int] = {}
    for relation in user._meta.related_objects:
        if getattr(relation, 'on_delete', None) is not models.CASCADE:
            continue
        model = relation.related_model
        label = model._meta.label
        if label in HOUSEKEEPING_MODELS:
            continue
        count = model._base_manager.filter(**{relation.field.name: user}).count()
        if count:
            blockers[label] = blockers.get(label, 0) + count
    return blockers


def delete_blocked_detail(blockers: dict[str, int]) -> str:
    from django.apps import apps

    summary = ', '.join(
        f'{count} {apps.get_model(label)._meta.verbose_name_plural}'
        for label, count in sorted(blockers.items())
    )
    return DELETE_BLOCKED_DETAIL.format(summary=summary)


def clear_leader_references(request, user, actor) -> dict[str, int]:
    """Detach everyone who points at ``user`` as a leader, with one audit row."""
    from core.services.lifecycle import record_lifecycle_event

    from ..models import Team, UserProfile

    orphaned_ids = list(
        UserProfile.objects.filter(models.Q(italian_tl=user) | models.Q(albanian_tl=user))
        .values_list('user_id', flat=True)
    )
    if orphaned_ids:
        record_lifecycle_event(
            request, user, 'user', 'DELETE', 'leader_links_cleared',
            extra={'cleared_for_user_ids': orphaned_ids}, actor=actor,
        )
    return {
        'italian_tl': UserProfile.objects.filter(italian_tl=user).update(italian_tl=None),
        'albanian_tl': UserProfile.objects.filter(albanian_tl=user).update(albanian_tl=None),
        'led_teams': Team.objects.filter(team_leader=user).update(team_leader=None),
    }


# --------------------------------------------------------------- superuser erase


class EraseRefused(Exception):
    """The erase cannot run at all (409): the reasons are in ``reasons``."""

    def __init__(self, reasons):
        super().__init__('; '.join(reasons))
        self.reasons = reasons


class EraseNotConfirmed(Exception):
    """The request is missing the phrase, the reason or an acknowledgement (400)."""


def erase_confirm_phrase(user) -> str:
    return f'ERASE {user.username}'


def _owner_fields(model, user_model) -> list[str]:
    """Columns of ``model`` that tie a row to a person (CASCADE keys to User)."""
    return [
        field.attname
        for field in model._meta.concrete_fields
        if field.is_relation
        and field.related_model is user_model
        and field.remote_field.on_delete is models.CASCADE
    ]


def _collected_rows(user):
    """Every row a delete would remove, as ``(model, list of field-value dicts)``."""
    collector = Collector(using=user._state.db or 'default')
    collector.collect([user])
    user_model = type(user)
    for model, instances in collector.data.items():
        yield model, [vars(instance) for instance in instances]
    for queryset in collector.fast_deletes:
        model = queryset.model
        wanted = _owner_fields(model, user_model)
        if model._meta.label in CLOSED_YEAR_MODELS:
            wanted.append('date')
        yield model, list(queryset.values(*wanted)) if wanted else [{}] * queryset.count()


def _leader_reference_counts(user) -> dict[str, int]:
    from ..models import Team, UserProfile

    return {
        'italian_tl': UserProfile.objects.filter(italian_tl=user).count(),
        'albanian_tl': UserProfile.objects.filter(albanian_tl=user).count(),
        'led_teams': Team.objects.filter(team_leader=user).count(),
    }


def erase_preview(user, actor) -> dict:
    """What erasing ``user`` would destroy, and whether it is allowed. Changes nothing."""
    from .approval_periods import is_year_closed

    user_model = type(user)
    reasons: list[str] = []
    will_delete: dict[str, int] = {}
    about_others: dict[str, int] = {}
    protected: dict[str, int] = {}
    closed_years: set[int] = set()

    if actor.pk == user.pk:
        reasons.append('You cannot erase your own account.')
    if user.is_active:
        reasons.append('Deactivate the user first; only an inactive user can be erased.')

    try:
        for model, rows in _collected_rows(user):
            label = model._meta.label
            if model is user_model or not rows:
                continue
            will_delete[label] = will_delete.get(label, 0) + len(rows)
            owners = _owner_fields(model, user_model)
            others = sum(
                1 for row in rows
                if any(row.get(name) not in (None, user.pk) for name in owners)
            )
            if others:
                about_others[label] = about_others.get(label, 0) + others
            if label in CLOSED_YEAR_MODELS:
                closed_years.update(
                    row['date'].year for row in rows
                    if row.get('date') is not None and is_year_closed(row['date'].year)
                )
    except ProtectedError as exc:
        for obj in exc.protected_objects:
            label = type(obj)._meta.label
            protected[label] = protected.get(label, 0) + 1
        kept = ', '.join(f'{count} {label}' for label, count in sorted(protected.items()))
        reasons.append(
            f'Payroll and evidence records are never erased: {kept}. '
            'They leave only through the archive purge after retention.'
        )
    if closed_years:
        years = ', '.join(str(year) for year in sorted(closed_years))
        reasons.append(
            f'Overtime or standby records sit in a closed year ({years}). '
            'Reopen the year first, or wait for the archive purge.'
        )

    return {
        'user_id': user.pk,
        'username': user.username,
        'can_erase': not reasons,
        'reasons': reasons,
        'will_delete': will_delete,
        'about_other_people': about_others,
        'protected': protected,
        'closed_years': sorted(closed_years),
        'leader_links_cleared': _leader_reference_counts(user),
        'confirm_phrase': erase_confirm_phrase(user),
        'min_reason_length': MIN_ERASE_REASON_LENGTH,
    }


def erase_user(user, *, actor, confirm, reason, acknowledge_other_people_records=False, request=None) -> dict:
    """Superuser override: delete ``user`` together with their business rows.

    Raises ``EraseRefused`` when the erase is not allowed and ``EraseNotConfirmed`` when
    the confirmation is incomplete. Writes the audit row before the delete and sends
    ``user_erased`` after the transaction commits.
    """
    from core.services.lifecycle import record_lifecycle_event

    if not actor.is_superuser:
        raise EraseRefused(['Only a superuser can erase a user.'])
    reason = (reason or '').strip()
    with transaction.atomic():
        preview = erase_preview(user, actor)
        if not preview['can_erase']:
            raise EraseRefused(preview['reasons'])
        if confirm != preview['confirm_phrase']:
            raise EraseNotConfirmed(f'Type "{preview["confirm_phrase"]}" to confirm.')
        if len(reason) < MIN_ERASE_REASON_LENGTH:
            raise EraseNotConfirmed(
                f'Give a reason of at least {MIN_ERASE_REASON_LENGTH} characters.')
        if preview['about_other_people'] and not acknowledge_other_people_records:
            raise EraseNotConfirmed(
                'This user wrote records about other people. Acknowledge that they will be erased too.')
        record_lifecycle_event(
            request, user, 'user', 'DELETE', 'user_erased',
            extra={
                'reason': reason,
                'will_delete': preview['will_delete'],
                'about_other_people': preview['about_other_people'],
                'leader_links_cleared': preview['leader_links_cleared'],
            },
            actor=actor,
        )
        payload = {
            'user_id': user.pk,
            'username': user.username,
            'actor_id': actor.pk,
            'reason': reason,
            'rows': sum(preview['will_delete'].values()),
        }
        clear_leader_references(request, user, actor)
        user.delete()
        transaction.on_commit(lambda: user_erased.send(sender=type(user), **payload))
    return {'erased': True, **payload}
