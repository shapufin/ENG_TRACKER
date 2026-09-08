"""
URL configuration for the Control Room plugin.

Phase 2: access management endpoints.
Phase 3: dashboard endpoints (summary, trend, roster).
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .viewsets import ControlRoomAccessViewSet, ControlRoomDashboardViewSet

router = DefaultRouter()
router.register(r'access', ControlRoomAccessViewSet, basename='control-room-access')
router.register(r'dashboard', ControlRoomDashboardViewSet, basename='control-room-dashboard')

urlpatterns = [
    path('', include(router.urls)),
]
