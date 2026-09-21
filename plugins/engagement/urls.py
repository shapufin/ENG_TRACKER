from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .viewsets import TLEngagementMetricsViewSet

router = DefaultRouter()
router.register(r'metrics', TLEngagementMetricsViewSet, basename='engagement-metrics')

urlpatterns = [
    path('', include(router.urls)),
]
