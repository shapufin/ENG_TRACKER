"""
Users app URL configuration.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .viewsets import ApprovalPeriodViewSet, TechViewSet, UserViewSet, UserProfileViewSet, TeamViewSet

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'profiles', UserProfileViewSet, basename='profile')
router.register(r'techs', TechViewSet, basename='tech')
router.register(r'teams', TeamViewSet, basename='team')
router.register(r'approval-periods', ApprovalPeriodViewSet, basename='approval-period')

urlpatterns = [
    path('', include(router.urls)),
]
