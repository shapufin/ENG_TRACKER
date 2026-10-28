"""
Dashboard app core models.

This module contains models for dashboard widgets and user preferences.
"""

from django.db import models
from django.contrib.auth.models import User
from core.maintenance.state import clear_maintenance_cache
from core.models.abstract import BaseModel


class DashboardWidget(BaseModel):
    """
    Dashboard widget configuration.
    
    Defines widgets that can be displayed on dashboards.
    """
    WIDGET_TYPE_CHOICES = [
        ('stat_card', 'Statistic Card'),
        ('chart', 'Chart'),
        ('table', 'Table'),
        ('list', 'List'),
        ('calendar', 'Calendar'),
    ]
    
    name = models.CharField(max_length=100)
    widget_type = models.CharField(
        max_length=20,
        choices=WIDGET_TYPE_CHOICES
    )
    description = models.TextField(blank=True)
    
    # Data source configuration
    data_source = models.CharField(max_length=100)
    configuration = models.JSONField(default=dict)
    
    # Display settings
    refresh_interval = models.IntegerField(
        default=300,
        help_text="Refresh interval in seconds"
    )
    
    is_active = models.BooleanField(default=True)
    
    class Meta:
        db_table = 'dashboard_widgets'
        ordering = ['name']
        indexes = [
            models.Index(fields=['widget_type']),
            models.Index(fields=['is_active']),
        ]
    
    def clean(self):
        """Validate JSON configuration structure."""
        super().clean()
        if self.configuration:
            required_keys = ['data_source', 'chart_type']
            # Only validate if it's a chart or stat_card
            if self.widget_type in ['chart', 'stat_card']:
                for key in required_keys:
                    if key not in self.configuration:
                        from django.core.exceptions import ValidationError
                        raise ValidationError(f"Missing required config key: {key} for {self.widget_type}")

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class UserDashboardPreference(BaseModel):
    """
    User dashboard preferences.
    
    Stores user-specific dashboard layouts and widget configurations.
    """
    DASHBOARD_TYPE_CHOICES = [
        ('hr', 'HR Dashboard'),
        ('team_leader', 'Team Leader Dashboard'),
        ('employee', 'Employee Dashboard'),
        ('admin', 'Admin Dashboard'),
    ]
    
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='dashboard_preferences'
    )
    dashboard_type = models.CharField(
        max_length=20,
        choices=DASHBOARD_TYPE_CHOICES
    )
    
    # Layout configuration
    layout = models.JSONField(default=dict)
    
    # Selected widgets
    widgets = models.ManyToManyField(
        DashboardWidget,
        through='DashboardWidgetAssignment'
    )
    
    class Meta:
        db_table = 'user_dashboard_preferences'
        unique_together = ['user', 'dashboard_type']
        indexes = [
            models.Index(fields=['user']),
            models.Index(fields=['dashboard_type']),
        ]
    
    def __str__(self):
        return f"{self.user.username} - {self.dashboard_type}"


class DashboardWidgetAssignment(BaseModel):
    """
    Widget assignment to user dashboards.
    
    Defines which widgets are assigned to which dashboards with position info.
    """
    preference = models.ForeignKey(
        UserDashboardPreference,
        on_delete=models.CASCADE,
        related_name='widget_assignments'
    )
    widget = models.ForeignKey(
        DashboardWidget,
        on_delete=models.CASCADE,
        related_name='assignments'
    )
    
    # Position in dashboard grid
    position_x = models.IntegerField(default=0)
    position_y = models.IntegerField(default=0)
    width = models.IntegerField(default=1)
    height = models.IntegerField(default=1)
    
    # Display order
    order = models.IntegerField(default=0)
    
    is_visible = models.BooleanField(default=True)
    
    class Meta:
        db_table = 'dashboard_widget_assignments'
        unique_together = ['preference', 'widget']
        ordering = ['order']
        indexes = [
            models.Index(fields=['preference']),
            models.Index(fields=['widget']),
        ]
    
    def __str__(self):
        return f"{self.widget.name} on {self.preference}"


class SiteBranding(BaseModel):
    """Site-wide branding singleton — name + logo shown in the sidebar/header.

    Plain FileField, not ImageField: ImageField requires Pillow, which this
    project doesn't otherwise depend on. Validation of "is this really an
    image" is left to the frontend file picker's accept filter.
    """
    site_name = models.CharField(max_length=100, default='Engineering Tracker')
    logo = models.FileField(upload_to='branding/', blank=True, null=True)

    class Meta:
        db_table = 'dashboard_site_branding'
        constraints = [
            models.CheckConstraint(
                condition=models.Q(pk=1),
                name='dashboard_site_branding_singleton',
            ),
        ]

    def __str__(self):
        return self.site_name


DEFAULT_MAINTENANCE_TITLE = 'Scheduled maintenance'
DEFAULT_MAINTENANCE_MESSAGE = (
    "We're updating the platform to keep it fast and reliable. "
    'Sign-in and data entry are paused until the update is complete.'
)


class MaintenanceState(BaseModel):
    """Site-wide maintenance switch. Single-row singleton table.

    While effective-active, only staff/superusers may authenticate or call the
    API (``core.maintenance``); everyone else gets 503 ``code=maintenance`` and
    the SPA renders the maintenance screen.

    ``ends_at`` self-expires the window: an admin who forgets to switch it off
    does not lock the team out indefinitely. The expiry is evaluated on read
    (``core.maintenance.state``), never by a scheduler.
    """
    is_active = models.BooleanField(default=False)
    title = models.CharField(max_length=120, default=DEFAULT_MAINTENANCE_TITLE)
    message = models.TextField(default=DEFAULT_MAINTENANCE_MESSAGE)
    started_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(
        null=True, blank=True,
        help_text='When the window closes by itself. Empty = until switched off.',
    )
    updated_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name='+',
        help_text='Last admin to change the switch (audit only, never exposed).',
    )

    class Meta:
        db_table = 'dashboard_maintenance_state'
        constraints = [
            models.CheckConstraint(
                condition=models.Q(pk=1),
                name='dashboard_maintenance_state_singleton',
            ),
        ]

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        clear_maintenance_cache()

    def __str__(self):
        return f"Maintenance: {'on' if self.is_active else 'off'}"
