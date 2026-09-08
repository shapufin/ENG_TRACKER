"""
Dashboard models module.
"""

from .core import DashboardWidget, UserDashboardPreference, DashboardWidgetAssignment
from .calendar import CalendarWorkspace, UserCalendarPreference, PublicHoliday

__all__ = [
    'DashboardWidget', 'UserDashboardPreference', 'DashboardWidgetAssignment',
    'CalendarWorkspace', 'UserCalendarPreference', 'PublicHoliday'
]
