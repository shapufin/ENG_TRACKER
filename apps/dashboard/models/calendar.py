"""
Calendar model for flexible workspace management.
Allows users to have multiple calendar workspaces with custom permissions.
"""
from django.db import models
from django.contrib.auth import get_user_model
from core.models import BaseModel

User = get_user_model()


class CalendarWorkspace(BaseModel):
    """
    Calendar Workspace - a named calendar view that users can subscribe to.

    Examples:
    - "Italian Team Calendar"
    - "Albanian Team Calendar"
    - "Project Alpha Calendar"
    - "HR Department Calendar"
    """
    name = models.CharField(max_length=100, help_text="Display name for the calendar")
    code = models.CharField(max_length=50, unique=True, help_text="Unique code for the calendar")
    description = models.TextField(blank=True)
    color = models.CharField(max_length=7, default='#3b82f6', help_text="Hex color for calendar display")
    icon = models.CharField(max_length=50, blank=True, help_text="Icon name for the calendar")

    # Link to primary team (optional, for team-based workspaces)
    team = models.ForeignKey(
        'users.Team',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='calendar_workspaces',
        help_text="Primary team for this workspace (optional)"
    )

    # Who can see this calendar
    is_public = models.BooleanField(default=False, help_text="If true, all users can see this calendar")
    allowed_users = models.ManyToManyField(
        User,
        blank=True,
        related_name='accessible_calendars',
        help_text="Specific users that can access this calendar"
    )

    # Calendar settings
    default_view = models.CharField(
        max_length=20,
        default='month',
        choices=[
            ('month', 'Month'),
            ('week', 'Week'),
            ('day', 'Day'),
            ('list', 'List'),
        ]
    )

    # What data types to show
    show_overtime = models.BooleanField(default=True)
    show_standby = models.BooleanField(default=True)
    show_vacation = models.BooleanField(default=True)
    show_holidays = models.BooleanField(default=True)

    class Meta:
        db_table = 'calendar_workspaces'
        ordering = ['name']
        verbose_name = 'Calendar Workspace'
        verbose_name_plural = 'Calendar Workspaces'
        indexes = [
            models.Index(fields=['team']),
        ]
        constraints = [
            models.UniqueConstraint(fields=['name'], name='calendar_workspace_name_unique'),
        ]

    def __str__(self):
        return self.name

    @classmethod
    def get_accessible_for_user(cls, user):
        """
        Return a queryset of workspaces the user has access to.
        """
        if user.is_staff or user.is_superuser:
            return cls.objects.all()

        from django.db.models import Q

        # 1. Public workspaces, 2. directly allowed users,
        # 3. team and calendar-group access.
        q_accessible = Q(is_public=True)
        q_accessible |= Q(allowed_users=user)
        profile = getattr(user, 'profile', None)
        if profile:
            team_ids = list(profile.teams.values_list('id', flat=True))
            if team_ids:
                # Direct team workspaces
                q_accessible |= Q(team__in=team_ids)
                # Workspaces shared via calendar_group
                calendar_groups = [cg for cg in profile.teams.values_list('calendar_group', flat=True) if cg]
                if calendar_groups:
                    q_accessible |= Q(team__calendar_group__in=calendar_groups)
        
        return cls.objects.filter(q_accessible).distinct()

    def get_users_for_workspace(self):
        """
        Get all users who belong to this specific workspace.

        Team-backed workspaces return only that team's members (plus the
        team leader), without expanding to other teams in the same
        ``calendar_group``.  ``calendar_group`` controls which workspaces
        a user can *see* (handled in ``get_accessible_for_user``), not
        which users appear inside a single workspace.

        Workspaces without a team fall back to explicit access
        (``allowed_users``) and public visibility.
        """
        from django.contrib.auth import get_user_model
        User = get_user_model()

        user_ids = set()

        if self.team:
            from apps.users.models import UserProfile

            team_members = (
                UserProfile.objects.filter(
                    teams__id=self.team_id,
                    user__is_active=True,
                )
                .values_list('user_id', flat=True)
            )
            user_ids.update(team_members)
            if self.team.team_leader_id:
                user_ids.add(self.team.team_leader_id)
        else:
            user_ids.update(self.allowed_users.values_list('id', flat=True))

            if self.is_public:
                user_ids.update(
                    User.objects.filter(is_active=True).values_list('id', flat=True)
                )

        try:
            from plugins.control_room.services.scope_service import get_calendar_excluded_user_ids
            user_ids.difference_update(get_calendar_excluded_user_ids())
        except ImportError:
            pass

        return (
            User.objects.filter(id__in=user_ids)
            .only(
                'id',
                'username',
                'first_name',
                'last_name',
                'email',
                'is_staff',
                'is_superuser',
            )
        )


class UserCalendarPreference(BaseModel):
    """
    User's preferred calendars - which calendars they have active/visible.
    Users can have multiple calendars and switch between them.
    """
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='calendar_preferences'
    )
    calendar = models.ForeignKey(
        CalendarWorkspace,
        on_delete=models.CASCADE,
        related_name='user_preferences'
    )
    
    # Display preferences
    is_active = models.BooleanField(default=True, help_text="Show this calendar in the view")
    is_default = models.BooleanField(default=False, help_text="This is the user's default calendar")
    display_color = models.CharField(max_length=7, blank=True, help_text="Override calendar color")
    sort_order = models.PositiveSmallIntegerField(default=0, help_text="Order in the calendar list")
    
    # Filter settings
    show_only_my_entries = models.BooleanField(default=False, help_text="Only show entries created by me")
    show_only_my_team = models.BooleanField(default=False, help_text="Only show entries from my team")
    
    class Meta:
        db_table = 'user_calendar_preferences'
        unique_together = ['user', 'calendar']
        ordering = ['sort_order', 'calendar__name']
    
    def __str__(self):
        return f"{self.user.username} - {self.calendar.name}"
    
    def save(self, *args, **kwargs):
        # Ensure only one default calendar per user
        if self.is_default:
            queryset = UserCalendarPreference.objects.filter(
                user=self.user,
                is_default=True
            )
            if self.pk:
                queryset = queryset.exclude(pk=self.pk)
            queryset.update(is_default=False)
        super().save(*args, **kwargs)


class PublicHoliday(BaseModel):
    """Public or workspace-scoped holiday definitions for calendar views."""

    calendar = models.ForeignKey(
        CalendarWorkspace,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='holidays',
        help_text="Optional workspace this holiday belongs to. Null = global holiday."
    )
    name = models.CharField(max_length=150)
    date = models.DateField()
    country_code = models.CharField(max_length=2, blank=True, help_text="ISO country code")
    is_global = models.BooleanField(default=True)
    description = models.TextField(blank=True)

    class Meta:
        db_table = 'public_holidays'
        ordering = ['date', 'name']
        unique_together = [
            ('date', 'calendar', 'country_code'),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['date', 'country_code'],
                condition=models.Q(calendar__isnull=True),
                name='public_holiday_global_date_country_unique',
            ),
        ]

    def __str__(self):
        scope = self.calendar.name if self.calendar else 'Global'
        return f"{self.name} ({scope})"
