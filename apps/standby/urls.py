from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .viewsets import StandbyLogViewSet, StandbyPatternViewSet

router = DefaultRouter()
router.register(r'logs', StandbyLogViewSet, basename='standbylog')
router.register(r'patterns', StandbyPatternViewSet, basename='standbypattern')

urlpatterns = [
    path('', include(router.urls)),
]
