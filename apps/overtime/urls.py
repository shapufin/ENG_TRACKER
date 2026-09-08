"""
Overtime app URL configuration.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .viewsets import ClientViewSet, OvertimeLogViewSet

router = DefaultRouter()
router.register(r'clients', ClientViewSet, basename='client')
router.register(r'logs', OvertimeLogViewSet, basename='overtimelog')

urlpatterns = [
    path('', include(router.urls)),
]
