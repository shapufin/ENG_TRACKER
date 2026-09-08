"""TL/HR/Admin scoping helpers for the Skills plugin.

Reuses ``UserProfile.get_team_member_ids()`` (3-source: FK + team M2M +
led_teams) — never FK-only queries. See CONTEXT.md hot invariant #3.
"""
from django.contrib.auth.models import User


def visible_user_ids(user):
    """Return the set of user IDs whose skill data ``user`` may see.

    - Admin/superuser: all active users
    - HR (profile.is_hr): all active users
    - TL (profile.is_team_leader): get_team_member_ids() + self
    - Employee: {self}
    """
    if user.is_superuser or user.is_staff:
        return set(
            User.objects.filter(is_active=True).values_list('id', flat=True)
        )
    profile = getattr(user, 'profile', None)
    if profile is not None and profile.is_hr:
        return set(
            User.objects.filter(is_active=True).values_list('id', flat=True)
        )
    if profile is not None and profile.is_team_leader:
        ids = profile.get_team_member_ids()
        ids.add(user.id)
        return ids
    return {user.id}


def can_edit_user_skill(actor, user_skill):
    """Check if ``actor`` can edit the level of ``user_skill``.

    - Self: always (own skill)
    - TL: if target user is in their team via get_team_member_ids()
    - HR: yes (broad access for HR management)
    - Admin/superuser: yes
    """
    if actor.is_superuser or actor.is_staff:
        return True
    profile = getattr(actor, 'profile', None)
    if profile is not None and profile.is_hr:
        return True
    if user_skill.user_id == actor.id:
        return True
    if profile is not None and profile.is_team_leader:
        member_ids = profile.get_team_member_ids()
        return user_skill.user_id in member_ids
    return False


def can_delete_user_skill(actor, user_skill):
    """Check if ``actor`` can delete (remove) a UserSkill.

    Only self, HR, and admin can remove skills from a profile.
    TLs can re-rate but NOT add/remove (per design decision).
    """
    if actor.is_superuser or actor.is_staff:
        return True
    profile = getattr(actor, 'profile', None)
    if profile is not None and profile.is_hr:
        return True
    return user_skill.user_id == actor.id
