"""
Dashboard app URL configuration.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .viewsets import (
    DashboardWidgetViewSet,
    UserDashboardPreferenceViewSet,
    CalendarWorkspaceViewSet,
    PublicHolidayViewSet,
    SiteBrandingViewSet,
)

router = DefaultRouter()
router.register(r'widgets', DashboardWidgetViewSet, basename='dashboardwidget')
router.register(r'preferences', UserDashboardPreferenceViewSet, basename='userdashboardpreference')
router.register(r'calendar-workspaces', CalendarWorkspaceViewSet, basename='calendarworkspace')
router.register(r'holidays', PublicHolidayViewSet, basename='publicholiday')
router.register(r'branding', SiteBrandingViewSet, basename='sitebranding')

urlpatterns = [
    path('', include(router.urls)),
]
