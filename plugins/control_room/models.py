"""
Control Room plugin models.

This plugin is a read-only scoped projection of existing core data
(``auth.User``, ``UserProfile``, ``Team``, ``TeamMembership``,
``StandbyLog``). It owns ONLY:

- ``ControlRoomAccess`` — grant an existing user access to the Control Room.
- ``ControlRoomTeamScope`` — which existing teams that user may observe.

No standby, team, or user data is copied. Removing the plugin removes only
these access/scope rows; core standby/team/user data is untouched.
"""
from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.users.models.core import Team


class ControlRoomAccess(models.Model):
    """
    Grants an existing Django user access to the Control Room dashboard.

    This is NOT a second identity. The user still authenticates via the
    normal login flow. This record only enables the Control Room UI and
    scopes which teams the user may observe.

    An inactive record (``is_active=False``) denies dashboard access even
    if team scopes exist. A record with no team scopes denies visibility
    into any team (empty scope is NOT global scope).
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='control_room_access',
        help_text=_('Existing application user granted Control Room access.'),
    )
    is_active = models.BooleanField(
        _('Active'),
        default=True,
        db_index=True,
        help_text=_('Inactive records deny dashboard access even if scopes exist.'),
    )
    display_name = models.CharField(
        _('Display Name'),
        max_length=120,
        blank=True,
        help_text=_('Optional dashboard label; defaults to the user full name.'),
    )
    timezone = models.CharField(
        _('Display Timezone'),
        max_length=64,
        blank=True,
        help_text=_('Optional future display timezone; defaults to application timezone.'),
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='control_room_access_granted',
        help_text=_('Administrator who granted this access.'),
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='control_room_access_updated',
        help_text=_('Administrator who last changed this access.'),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _('Control Room Access')
        verbose_name_plural = _('Control Room Access')
        ordering = ['user__username']
        indexes = [
            models.Index(fields=['is_active']),
        ]

    def __str__(self):
        return f"CR Access: {self.user.username} ({'active' if self.is_active else 'inactive'})"


class ControlRoomTeamScope(models.Model):
    """
    Teams a Control Room user may observe.

    Empty scope for a non-admin user means NO visibility, not global
    visibility. ``include_subteams`` is reserved for future hierarchy
    expansion and defaults to False in the MVP.
    """

    access = models.ForeignKey(
        ControlRoomAccess,
        on_delete=models.CASCADE,
        related_name='team_scopes',
        help_text=_('Control Room access record this scope belongs to.'),
    )
    team = models.ForeignKey(
        Team,
        on_delete=models.CASCADE,
        related_name='control_room_scopes',
        help_text=_('Existing core team whose members/standby are visible.'),
    )
    include_subteams = models.BooleanField(
        _('Include Subteams'),
        default=False,
        help_text=_('Reserved for future hierarchy expansion. MVP: always False.'),
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='control_room_scopes_created',
        help_text=_('Administrator who assigned this scope.'),
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _('Control Room Team Scope')
        verbose_name_plural = _('Control Room Team Scopes')
        unique_together = ['access', 'team']
        ordering = ['team__name']
        indexes = [
            models.Index(fields=['access']),
            models.Index(fields=['team']),
        ]

    def __str__(self):
        return f"CR Scope: {self.access.user.username} -> {self.team.name}"
