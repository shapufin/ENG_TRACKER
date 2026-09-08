"""
Users app core models.

This module contains models for user management, teams, and user profiles.
"""

from django.contrib.auth.models import User
from django.db import models
from django.db.models import Q
from django.db.models.signals import post_save
from django.dispatch import receiver
from core.models.abstract import BaseModel


class Tech(BaseModel):
    """Independent technology classification for users.

    Tech is descriptive metadata and is intentionally separate from Team,
    calendar visibility, and permission scope.
    """
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=20, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = 'techs'
        ordering = ['name']
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['is_active', 'name']),
        ]

    def __str__(self):
        return f"{self.name} ({self.code})"

    def save(self, *args, **kwargs):
        """Normalize code to uppercase for database-portable uniqueness."""
        if self.code:
            self.code = self.code.upper()
        super().save(*args, **kwargs)


class Team(BaseModel):
    """
    Team model for organizing users into groups.
    
    Supports hierarchical team structure where a team can have a parent team.
    This enables the Italian TL -> Albanian TL permission inheritance pattern.
    """
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=10, unique=True)
    parent_team = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='sub_teams'
    )
    team_leader = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='led_teams'
    )
    calendar_group = models.CharField(
        max_length=50,
        blank=True,
        default='',
        db_index=True,
        help_text='Teams with the same calendar_group share calendar visibility'
    )
    description = models.TextField(blank=True)

    class Meta:
        db_table = 'teams'
        ordering = ['name']
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['parent_team']),
            models.Index(fields=['team_leader']),
        ]

    def __str__(self):
        return f"{self.name} ({self.code})"

    def get_hierarchy(self):
        """Get the full team hierarchy from this team up to root."""
        hierarchy = [self]
        visited = {self.pk}
        current = self
        while current.parent_team:
            parent = current.parent_team
            if parent.pk in visited:
                break
            hierarchy.append(parent)
            visited.add(parent.pk)
            current = parent
        return hierarchy

    def get_all_sub_teams(self):
        """Get all sub-teams recursively."""
        def _collect(team, collected, visited):
            for sub in team.sub_teams.prefetch_related('sub_teams').all():
                if sub.pk in visited:
                    continue
                collected.append(sub)
                visited.add(sub.pk)
                _collect(sub, collected, visited)
            return collected
        return _collect(self, [], {self.pk})


class TeamMembership(BaseModel):
    """
    Through model for User-Team ManyToMany relationship.
    Tracks membership metadata like join date and primary team status.
    """
    user_profile = models.ForeignKey(
        'UserProfile',
        on_delete=models.CASCADE,
        related_name='team_memberships'
    )
    team = models.ForeignKey(
        Team,
        on_delete=models.CASCADE,
        related_name='user_memberships'
    )
    joined_date = models.DateField(
        null=True,
        blank=True,
        help_text='Date when user joined this team'
    )
    is_primary_team = models.BooleanField(
        default=False,
        help_text='Mark this as the user primary team for calendar default'
    )

    class Meta:
        db_table = 'team_memberships'
        unique_together = ['user_profile', 'team']
        indexes = [
            models.Index(fields=['user_profile', 'is_primary_team']),
            models.Index(fields=['team']),
        ]

    def __str__(self):
        return f"{self.user_profile.user.username} - {self.team.name}"


class ApprovalPeriodBoundary(BaseModel):
    """Per-month coordination row for TL approval-period operations."""
    period = models.DateField(unique=True, db_index=True)

    class Meta:
        db_table = 'approval_period_boundaries'
        ordering = ['-period']

    def __str__(self):
        return f'Approval period boundary {self.period:%Y-%m}'


class ApprovalPeriodClose(BaseModel):
    """Immutable TL close snapshot for one managed user scope and month."""
    boundary = models.ForeignKey(
        ApprovalPeriodBoundary,
        on_delete=models.CASCADE,
        related_name='closes',
    )
    closed_at = models.DateTimeField(db_index=True)
    closed_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='approval_period_closes',
    )
    scope_type = models.CharField(max_length=40, default='managed_scope')
    scope_key = models.CharField(max_length=100)

    class Meta:
        db_table = 'approval_period_closes'
        ordering = ['-closed_at']
        constraints = [
            models.UniqueConstraint(
                fields=['boundary', 'scope_key'],
                name='approval_close_boundary_scope_unique',
            ),
        ]
        indexes = [
            models.Index(fields=['boundary', 'closed_at']),
            models.Index(fields=['closed_by', 'boundary']),
        ]

    @property
    def period(self):
        return self.boundary.period

    def __str__(self):
        return f'{self.period:%Y-%m} closed by {self.closed_by_id}'


class ApprovalPeriodCloseMember(BaseModel):
    """User membership snapshot captured when a TL closes a period."""
    close = models.ForeignKey(
        ApprovalPeriodClose,
        on_delete=models.CASCADE,
        related_name='members',
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='approval_period_close_memberships',
    )
    source_team = models.ForeignKey(
        Team,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='approval_period_close_members',
    )

    class Meta:
        db_table = 'approval_period_close_members'
        constraints = [
            models.UniqueConstraint(
                fields=['close', 'user'],
                name='approval_close_member_unique',
            ),
        ]
        indexes = [
            models.Index(fields=['user', 'close']),
        ]


class UserProfile(BaseModel):
    """
    Extended user profile with additional fields.
    
    This model extends Django's built-in User model with team membership
    and role information for the Time Tracker application.
    """
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='profile'
    )

    # Backward compatibility property
    @property
    def profile(self):
        """Backward compatibility: self is already the profile."""
        return self

    # Multi-team support: users can belong to multiple teams
    teams = models.ManyToManyField(
        Team,
        through='TeamMembership',
        blank=True,
        related_name='members'
    )
    techs = models.ManyToManyField(
        Tech,
        blank=True,
        related_name='users',
    )

    # Backward compatibility: return primary team or first team
    @property
    def team(self):
        """Return primary team or first team for backward compatibility."""
        return self.get_primary_team()

    def get_primary_team(self):
        """Return the explicit primary team, or the first stable team.

        Callers that render many users should prefetch
        ``profile__team_memberships__team`` before using this helper.
        """
        memberships = list(self.team_memberships.all())
        primary = next((m for m in memberships if m.is_primary_team), None)
        if primary:
            return primary.team
        return memberships[0].team if memberships else None
    # Each user has 2 Team Leaders (required for this organization)
    albanian_tl = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='albanian_team_members',
        help_text='Albanian Team Leader assigned to this user'
    )
    italian_tl = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='italian_team_members',
        help_text='Italian Team Leader assigned to this user'
    )
    is_hr_user = models.BooleanField(default=False)
    is_italian_tl_role = models.BooleanField(
        default=False,
        db_index=True,
        help_text='Explicitly marks user as an Italian Team Leader (role-based)'
    )
    is_albanian_tl_role = models.BooleanField(
        default=False,
        db_index=True,
        help_text='Explicitly marks user as an Albanian Team Leader (role-based)'
    )
    # Denormalized role-code cache; UserRole remains authoritative.
    role_codes = models.JSONField(default=list, blank=True, editable=False)
    phone = models.CharField(max_length=20, blank=True)
    hire_date = models.DateField(
        null=True,
        blank=True,
        db_index=True,
        help_text='Date of hire for leave accrual calculation'
    )
    clients = models.ManyToManyField(
        'overtime.Client',
        blank=True,
        related_name='assigned_users',
        help_text='Clients this user is assigned to (used for KPI evidence and uploads)'
    )

    class Meta:
        db_table = 'user_profiles'
        indexes = [
            models.Index(fields=['albanian_tl']),
            models.Index(fields=['italian_tl']),
            models.Index(fields=['is_hr_user']),
            models.Index(fields=['hire_date']),
        ]

    def __str__(self):
        return f"{self.user.username} Profile"

    def get_full_team_hierarchy(self):
        """Get team hierarchy for primary team if user is in teams."""
        if self.team:
            return self.team.get_hierarchy()
        return []

    def get_team_member_ids(self):
        """
        Get IDs of all users this user can manage as a team leader.

        Sources (combined in one query):
        1. Direct FK assignments (`italian_tl` / `albanian_tl`)
        2. Members of teams this user belongs to (shared calendar/team M2M)
        3. Members of teams where this user is `Team.team_leader` (`led_teams`)

        Including Q(italian_tl=...) and Q(albanian_tl=...) unconditionally is
        safe: if no UserProfile points to this user those conditions simply
        match zero rows — no .exists() pre-checks needed.
        """
        user = self.user
        membership_team_ids = set(self.teams.values_list('id', flat=True))
        led_team_ids = set(user.led_teams.values_list('id', flat=True))
        team_ids = membership_team_ids | led_team_ids

        filters = Q(italian_tl=user) | Q(albanian_tl=user)
        if team_ids:
            filters |= Q(teams__id__in=team_ids)

        return set(
            UserProfile.objects.filter(filters)
            .values_list('user_id', flat=True)
            .distinct()
        )

    @property
    def managed_users(self):
        """Return queryset of Django User objects managed by this profile."""
        user_ids = self.get_team_member_ids()
        if not user_ids:
            return User.objects.none()
        return User.objects.filter(id__in=user_ids)


    @property
    def is_team_leader(self):
        """
        Check if user is any type of team leader (Albanian or Italian).

        Database role codes are checked first (0 DB queries — role_codes is
        a denormalized JSON cache on the profile). Legacy flag fields are
        checked second. Only falls through to DB existence checks when both
        are unset, reducing the common per-request cost from up to 3 queries
        to 0 for role-flagged TLs.
        """
        role_codes = self.role_codes or []
        if 'italian_tl' in role_codes or 'albanian_tl' in role_codes:
            return True
        if self.is_italian_tl_role or self.is_albanian_tl_role:
            return True
        if self.user.led_teams.exists():
            return True
        return UserProfile.objects.filter(
            Q(italian_tl=self.user) | Q(albanian_tl=self.user)
        ).exists()

    @property
    def is_hr(self):
        """Check if user has the HR role (database role or legacy flag)."""
        if 'hr' in (self.role_codes or []):
            return True
        return self.is_hr_user

    @property
    def is_albanian_tl(self):
        """Check if user is an Albanian team leader (database role or legacy flag)."""
        if 'albanian_tl' in (self.role_codes or []):
            return True
        return self.is_albanian_tl_role or self.user.albanian_team_members.exists()

    @property
    def is_italian_tl(self):
        """Check if user is an Italian team leader (database role or legacy flag)."""
        if 'italian_tl' in (self.role_codes or []):
            return True
        return self.is_italian_tl_role or self.user.italian_team_members.exists()


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    """Create a UserProfile automatically when a User is created."""
    if created:
        UserProfile.objects.create(user=instance)


@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    """Save the UserProfile whenever the User is saved."""
    if hasattr(instance, 'profile'):
        instance.profile.save()
