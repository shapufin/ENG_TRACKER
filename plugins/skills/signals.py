"""Audit signal handlers for UserSkill level changes.

Connected by ``plugin.py ready()`` on activation with ``dispatch_uid`` so
``disable()`` can disconnect them robustly. Three signals:

- ``pre_save`` (``skills.track_rating_state``): captures the previous level
  on the instance (``_original_level``) for comparison in ``post_save``.
- ``post_save`` (``skills.log_rating_change``): logs create (null→level) or
  update (old→new, only if level changed). Skips non-level field edits.
- ``pre_delete`` (``skills.log_rating_delete``): logs delete (level→null).
  Uses pre_delete (not post_delete) so the skill FK is still valid during
  cascade deletions.
"""
from django.db.models.signals import pre_save, post_save, pre_delete

from .models import UserSkill, SkillRatingHistory


def _classify_source(actor, target_user):
    """Classify who changed a rating: self / tl / hr / admin / system."""
    if actor is None:
        return 'system'
    if actor.id == target_user.id:
        return 'self'
    if actor.is_superuser or actor.is_staff:
        return 'admin'
    profile = getattr(actor, 'profile', None)
    if profile is not None and profile.is_hr:
        return 'hr'
    if profile is not None and profile.is_team_leader:
        member_ids = profile.get_team_member_ids()
        if target_user.id in member_ids:
            return 'tl'
    return 'system'


def _track_rating_state(sender, instance, **kwargs):
    """pre_save: capture the original level for post_save comparison."""
    if instance.pk:
        try:
            original = UserSkill.objects.get(pk=instance.pk)
            instance._original_level = original.level
        except UserSkill.DoesNotExist:
            instance._original_level = None
    else:
        instance._original_level = None


def _log_rating_change(sender, instance, created, **kwargs):
    """post_save: create a SkillRatingHistory row when the level changes."""
    old_level = getattr(instance, '_original_level', None)
    new_level = instance.level

    if not created and old_level == new_level:
        # Non-level field edit — no audit row.
        return

    actor = instance.last_updated_by
    source = _classify_source(actor, instance.user)

    SkillRatingHistory.objects.create(
        user_skill=instance,
        user=instance.user,
        skill=instance.skill,
        old_level=None if created else old_level,
        new_level=new_level,
        changed_by=actor,
        source=source,
    )


def _log_rating_delete(sender, instance, **kwargs):
    """pre_delete: log the removal (level → null).

    Uses pre_delete (not post_delete) so the skill FK is still valid during
    cascade deletions (e.g. admin deletes a Skill → UserSkill cascade).
    The ``user_skill`` FK is set to None because the row is being deleted.
    """
    actor = instance.last_updated_by
    source = _classify_source(actor, instance.user)

    SkillRatingHistory.objects.create(
        user_skill=None,  # The row is being deleted; FK would be dangling.
        user=instance.user,
        skill=instance.skill,
        old_level=instance.level,
        new_level=None,
        changed_by=actor,
        source=source,
    )


def connect():
    """Connect all audit signals with stable dispatch_uids."""
    pre_save.connect(
        _track_rating_state,
        sender=UserSkill,
        dispatch_uid='skills.track_rating_state',
    )
    post_save.connect(
        _log_rating_change,
        sender=UserSkill,
        dispatch_uid='skills.log_rating_change',
    )
    pre_delete.connect(
        _log_rating_delete,
        sender=UserSkill,
        dispatch_uid='skills.log_rating_delete',
    )


def disconnect():
    """Disconnect all audit signals by dispatch_uid."""
    pre_save.disconnect(
        sender=UserSkill,
        dispatch_uid='skills.track_rating_state',
    )
    post_save.disconnect(
        sender=UserSkill,
        dispatch_uid='skills.log_rating_change',
    )
    pre_delete.disconnect(
        sender=UserSkill,
        dispatch_uid='skills.log_rating_delete',
    )


# Connect at import time so plugin.py `from . import signals` wires them.
# plugin.py ready() imports this module; disable() calls disconnect().
connect()
