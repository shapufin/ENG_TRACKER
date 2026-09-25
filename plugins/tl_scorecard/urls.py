from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .viewsets import TLScorecardViewSet

router = DefaultRouter()
router.register(r'', TLScorecardViewSet, basename='tl-scorecard')

urlpatterns = [
    path('', include(router.urls)),
]
