"""
URL routing for the Universal Data Import plugin.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .viewsets import (
    ImportTargetViewSet,
    ImportProfileViewSet,
    DataImportViewSet,
)

router = DefaultRouter()
router.register(r'targets', ImportTargetViewSet, basename='data-import-target')
router.register(r'profiles', ImportProfileViewSet, basename='data-import-profile')
router.register(r'import', DataImportViewSet, basename='data-import')

urlpatterns = [
    path('', include(router.urls)),
]