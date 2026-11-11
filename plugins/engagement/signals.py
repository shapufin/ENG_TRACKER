"""Keep TL engagement snapshots synced when leader links or team memberships change.

Unfrozen snapshots for teams where a leader lost all active linked members are
pruned immediately; frozen snapshots record `manager_changed_at` (except when
the team itself was archived). Every receiver skips `raw=True` saves so
`site_backup` fixture restores never fire side effects.
"""
from django.contrib.auth.models import User
from django.db.models.signals import m2m_changed, post_delete, post_save, pre_save

from apps.users.models import Team, TeamMembership, UserProfile
from core.utils.timezone_local import business_today

from .models import TLApprovalMetric
from .services import sync_manager_change_markers

_TL_FIELDS = frozenset({'italian_tl', 'italian_tl_id', 'albanian_tl', 'albanian_tl_id'})
_UID_PREFIX = 'engagement.'


def _profile_pre_save(sender, instance, **kwargs):
    if kwargs.get('raw') or not instance.pk:
        instance._prev_engagement_tl_ids = None
        return
    update_fields = kwargs.get('update_fields')
    if update_fields is not None and not (_TL_FIELDS & set(update_fields)):
        instance._prev_engagement_tl_ids = None
        return
    instance._prev_engagement_tl_ids = UserProfile.objects.filter(pk=instance.pk).values_list(
        'italian_tl_id', 'albanian_tl_id'
    ).first()


def _profile_post_save(sender, instance, created, **kwargs):
    if kwargs.get('raw'):
        return
    prev_pair = getattr(instance, '_prev_engagement_tl_ids', None)
    if created:
        changed = {instance.italian_tl_id, instance.albanian_tl_id} - {None}
    elif prev_pair is not None:
        prev = set(prev_pair) - {None}
        curr = {instance.italian_tl_id, instance.albanian_tl_id} - {None}
        changed = prev ^ curr
    else:
        return
    if not changed:
        return
    team_ids = set(
        TeamMembership.objects.filter(user_profile=instance, is_deleted=False).values_list('team_id', flat=True)
    )
    if team_ids:
        sync_manager_change_markers(changed, team_ids=team_ids, today=business_today())


def _user_pre_save(sender, instance, **kwargs):
    if kwargs.get('raw') or not instance.pk:
        instance._prev_engagement_active = None
        return
    update_fields = kwargs.get('update_fields')
    if update_fields is not None and 'is_active' not in update_fields:
        instance._prev_engagement_active = None
        return
    instance._prev_engagement_active = User.objects.filter(pk=instance.pk).values_list(
        'is_active', flat=True
    ).first()


def _user_post_save(sender, instance, created, **kwargs):
    if kwargs.get('raw') or created:
        return
    prev_active = getattr(instance, '_prev_engagement_active', None)
    if prev_active is None or prev_active == instance.is_active:
        return
    profile_row = UserProfile.objects.filter(user=instance).values_list(
        'id', 'italian_tl_id', 'albanian_tl_id'
    ).first()
    if not profile_row:
        return
    profile_id, it_id, al_id = profile_row
    leaders = {it_id, al_id} - {None}
    if not leaders:
        return
    team_ids = set(
        TeamMembership.objects.filter(user_profile_id=profile_id, is_deleted=False).values_list('team_id', flat=True)
    )
    if team_ids:
        sync_manager_change_markers(leaders, team_ids=team_ids, today=business_today())


def _team_pre_save(sender, instance, **kwargs):
    if kwargs.get('raw') or not instance.pk:
        instance._prev_engagement_team_active = None
        return
    update_fields = kwargs.get('update_fields')
    if update_fields is not None and 'is_active' not in update_fields:
        instance._prev_engagement_team_active = None
        return
    instance._prev_engagement_team_active = Team.objects.filter(pk=instance.pk).values_list(
        'is_active', flat=True
    ).first()


def _team_post_save(sender, instance, created, **kwargs):
    if kwargs.get('raw') or created:
        return
    prev_active = getattr(instance, '_prev_engagement_team_active', None)
    # Archiving a team deletes its memberships right before setting is_active=False;
    # clear any manager_changed_at so an archived team is not mislabelled.
    if prev_active is True and not instance.is_active:
        TLApprovalMetric.objects.filter(team=instance, manager_changed_at__isnull=False).update(
            manager_changed_at=None
        )


def _membership_changed(sender, instance, action, reverse, model, pk_set, **kwargs):
    if action not in ('post_add', 'post_remove', 'post_clear'):
        return
    if not reverse and isinstance(instance, UserProfile):
        leaders = {instance.italian_tl_id, instance.albanian_tl_id} - {None}
        if leaders:
            team_ids = pk_set if action != 'post_clear' else None
            sync_manager_change_markers(leaders, team_ids=team_ids, today=business_today())
    elif reverse and isinstance(instance, Team):
        if not instance.is_active:
            return
        if action == 'post_clear':
            leader_ids = set(
                TLApprovalMetric.objects.filter(team=instance).values_list('leader_id', flat=True)
            )
        elif pk_set:
            pairs = UserProfile.objects.filter(pk__in=pk_set).values_list('italian_tl_id', 'albanian_tl_id')
            leader_ids = {lid for pair in pairs for lid in pair if lid is not None}
        else:
            leader_ids = set()
        if leader_ids:
            sync_manager_change_markers(leader_ids, team_ids={instance.pk}, today=business_today())


def _membership_row_saved(sender, instance, **kwargs):
    if kwargs.get('raw'):
        return
    _sync_for_membership(instance)


def _membership_row_deleted(sender, instance, **kwargs):
    _sync_for_membership(instance)


def _sync_for_membership(instance):
    if not instance.user_profile_id or not instance.team_id:
        return
    row = UserProfile.objects.filter(pk=instance.user_profile_id).values_list(
        'italian_tl_id', 'albanian_tl_id'
    ).first()
    if not row:
        return
    leaders = set(row) - {None}
    if leaders:
        sync_manager_change_markers(leaders, team_ids={instance.team_id}, today=business_today())


def connect():
    pre_save.connect(_profile_pre_save, sender=UserProfile, dispatch_uid=f'{_UID_PREFIX}profile_pre_save')
    post_save.connect(_profile_post_save, sender=UserProfile, dispatch_uid=f'{_UID_PREFIX}profile_post_save')
    pre_save.connect(_user_pre_save, sender=User, dispatch_uid=f'{_UID_PREFIX}user_pre_save')
    post_save.connect(_user_post_save, sender=User, dispatch_uid=f'{_UID_PREFIX}user_post_save')
    pre_save.connect(_team_pre_save, sender=Team, dispatch_uid=f'{_UID_PREFIX}team_pre_save')
    post_save.connect(_team_post_save, sender=Team, dispatch_uid=f'{_UID_PREFIX}team_post_save')
    m2m_changed.connect(
        _membership_changed, sender=UserProfile.teams.through, dispatch_uid=f'{_UID_PREFIX}m2m_changed'
    )
    post_save.connect(_membership_row_saved, sender=TeamMembership, dispatch_uid=f'{_UID_PREFIX}tm_saved')
    post_delete.connect(_membership_row_deleted, sender=TeamMembership, dispatch_uid=f'{_UID_PREFIX}tm_deleted')


def disconnect():
    pre_save.disconnect(sender=UserProfile, dispatch_uid=f'{_UID_PREFIX}profile_pre_save')
    post_save.disconnect(sender=UserProfile, dispatch_uid=f'{_UID_PREFIX}profile_post_save')
    pre_save.disconnect(sender=User, dispatch_uid=f'{_UID_PREFIX}user_pre_save')
    post_save.disconnect(sender=User, dispatch_uid=f'{_UID_PREFIX}user_post_save')
    pre_save.disconnect(sender=Team, dispatch_uid=f'{_UID_PREFIX}team_pre_save')
    post_save.disconnect(sender=Team, dispatch_uid=f'{_UID_PREFIX}team_post_save')
    m2m_changed.disconnect(sender=UserProfile.teams.through, dispatch_uid=f'{_UID_PREFIX}m2m_changed')
    post_save.disconnect(sender=TeamMembership, dispatch_uid=f'{_UID_PREFIX}tm_saved')
    post_delete.disconnect(sender=TeamMembership, dispatch_uid=f'{_UID_PREFIX}tm_deleted')

