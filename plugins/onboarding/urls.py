from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .export_viewsets import ClientExportViewSet
from .viewsets import DocumentViewSet, FolderViewSet, OnboardingClientViewSet

router = DefaultRouter()
router.register(r'clients', OnboardingClientViewSet, basename='onboarding-client')
router.register(r'folders', FolderViewSet, basename='onboarding-folder')
router.register(r'documents', DocumentViewSet, basename='onboarding-document')
router.register(r'exports', ClientExportViewSet, basename='onboarding-export')

urlpatterns = [
    path('', include(router.urls)),
]
