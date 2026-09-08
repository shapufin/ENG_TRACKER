"""
Dashboard app core models.

This module contains models for dashboard widgets and user preferences.
"""

from django.db import models
from django.contrib.auth.models import User
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
