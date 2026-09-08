"""
Leave management app URL configuration.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .viewsets import LeaveBalanceViewSet, LeaveRequestViewSet, GlobalSettingsViewSet

router = DefaultRouter()
router.register(r'balances', LeaveBalanceViewSet, basename='leavebalance')
router.register(r'requests', LeaveRequestViewSet, basename='leaverequest')
router.register(r'settings', GlobalSettingsViewSet, basename='globalsettings')

urlpatterns = [
    path('', include(router.urls)),
]
